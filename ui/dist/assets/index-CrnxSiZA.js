var Lg=Object.defineProperty;var Ng=(e,t,s)=>t in e?Lg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var kt=(e,t,s)=>Ng(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Mg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new eo("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new qr(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new eo("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new qr((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new qr((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new eo((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof eo?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class eo extends Error{constructor(t){super(t),this.name="AuthError"}}class qr extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Dg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const z=new Mg,lt=new Dg(z);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Hs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const st={},vi=[],os=()=>{},fi=()=>!1,Hn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),or=e=>e.startsWith("onUpdate:"),tt=Object.assign,od=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Pg=Object.prototype.hasOwnProperty,ft=(e,t)=>Pg.call(e,t),Ie=Array.isArray,gi=e=>$i(e)==="[object Map]",jn=e=>$i(e)==="[object Set]",_u=e=>$i(e)==="[object Date]",Fg=e=>$i(e)==="[object RegExp]",Be=e=>typeof e=="function",Ge=e=>typeof e=="string",gs=e=>typeof e=="symbol",dt=e=>e!==null&&typeof e=="object",rd=e=>(dt(e)||Be(e))&&Be(e.then)&&Be(e.catch),Nf=Object.prototype.toString,$i=e=>Nf.call(e),$g=e=>$i(e).slice(8,-1),rr=e=>$i(e)==="[object Object]",cr=e=>Ge(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ga=Hs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ug=Hs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),dr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Bg=/-\w/g,_t=dr(e=>e.replace(Bg,t=>t.slice(1).toUpperCase())),zg=/\B([A-Z])/g,Ls=dr(e=>e.replace(zg,"-$1").toLowerCase()),Vn=dr(e=>e.charAt(0).toUpperCase()+e.slice(1)),bi=dr(e=>e?`on${Vn(e)}`:""),Qt=(e,t)=>!Object.is(e,t),yi=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Mf=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},ur=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Io=e=>{const t=Ge(e)?Number(e):NaN;return isNaN(t)?e:t};let wu;const pr=()=>wu||(wu=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Hg(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const jg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Vg=Hs(jg);function zl(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Ge(a)?Df(a):zl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Ge(e)||dt(e))return e}const qg=/;(?![^(]*\))/g,Gg=/:([^]+)/,Wg=/\/\*[^]*?\*\//g;function Df(e){const t={};return e.replace(Wg,"").split(qg).forEach(s=>{if(s){const a=s.split(Gg);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function Hl(e){let t="";if(Ge(e))t=e;else if(Ie(e))for(let s=0;s<e.length;s++){const a=Hl(e[s]);a&&(t+=a+" ")}else if(dt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Kg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ge(t)&&(e.class=Hl(t)),s&&(e.style=zl(s)),e}const Jg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Zg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Yg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Qg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Xg=Hs(Jg),eb=Hs(Zg),tb=Hs(Yg),sb=Hs(Qg),ab="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",nb=Hs(ab);function Pf(e){return!!e||e===""}function ib(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Za(e[a],t[a]);return s}function Za(e,t){if(e===t)return!0;let s=_u(e),a=_u(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=gs(e),a=gs(t),s||a)return e===t;if(s=Ie(e),a=Ie(t),s||a)return s&&a?ib(e,t):!1;if(s=dt(e),a=dt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Za(e[l],t[l]))return!1}}return String(e)===String(t)}function fr(e,t){return e.findIndex(s=>Za(s,t))}const Ff=e=>!!(e&&e.__v_isRef===!0),$f=e=>Ge(e)?e:e==null?"":Ie(e)||dt(e)&&(e.toString===Nf||!Be(e.toString))?Ff(e)?$f(e.value):JSON.stringify(e,Uf,2):String(e),Uf=(e,t)=>Ff(t)?Uf(e,t.value):gi(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[Gr(a,i)+" =>"]=n,s),{})}:jn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Gr(s))}:gs(t)?Gr(t):dt(t)&&!Ie(t)&&!rr(t)?String(t):t,Gr=(e,t="")=>{var s;return gs(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function lb(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Wt;class cd{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Wt&&(Wt.active?(this.parent=Wt,this.index=(Wt.scopes||(Wt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Wt;try{return Wt=this,t()}finally{Wt=s}}}on(){++this._on===1&&(this.prevScope=Wt,Wt=this)}off(){if(this._on>0&&--this._on===0){if(Wt===this)Wt=this.prevScope;else{let t=Wt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function ob(e){return new cd(e)}function Bf(){return Wt}function rb(e,t=!1){Wt&&Wt.cleanups.push(e)}let Tt;const Wr=new WeakSet;class xl{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Wt&&(Wt.active?Wt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Wr.has(this)&&(Wr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Hf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,ku(this),jf(this);const t=Tt,s=la;Tt=this,la=!0;try{return this.fn()}finally{Vf(this),Tt=t,la=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)pd(t);this.deps=this.depsTail=void 0,ku(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Wr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){_c(this)&&this.run()}get dirty(){return _c(this)}}let zf=0,dl,ul;function Hf(e,t=!1){if(e.flags|=8,t){e.next=ul,ul=e;return}e.next=dl,dl=e}function dd(){zf++}function ud(){if(--zf>0)return;if(ul){let t=ul;for(ul=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;dl;){let t=dl;for(dl=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function jf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Vf(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),pd(a),cb(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function _c(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(qf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function qf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===_l)||(e.globalVersion=_l,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!_c(e))))return;e.flags|=2;const t=e.dep,s=Tt,a=la;Tt=e,la=!0;try{jf(e);const n=e.fn(e._value);(t.version===0||Qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{Tt=s,la=a,Vf(e),e.flags&=-3}}function pd(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)pd(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function cb(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function db(e,t){e.effect instanceof xl&&(e=e.effect.fn);const s=new xl(e);t&&tt(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function ub(e){e.effect.stop()}let la=!0;const Gf=[];function Ya(){Gf.push(la),la=!1}function Qa(){const e=Gf.pop();la=e===void 0?!0:e}function ku(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Tt;Tt=void 0;try{t()}finally{Tt=s}}}let _l=0;class pb{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class mr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Tt||!la||Tt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Tt)s=this.activeLink=new pb(Tt,this),Tt.deps?(s.prevDep=Tt.depsTail,Tt.depsTail.nextDep=s,Tt.depsTail=s):Tt.deps=Tt.depsTail=s,Wf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=Tt.depsTail,s.nextDep=void 0,Tt.depsTail.nextDep=s,Tt.depsTail=s,Tt.deps===s&&(Tt.deps=a)}return s}trigger(t){this.version++,_l++,this.notify(t)}notify(t){dd();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{ud()}}}function Wf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)Wf(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Oo=new WeakMap,Nn=Symbol(""),wc=Symbol(""),wl=Symbol("");function ms(e,t,s){if(la&&Tt){let a=Oo.get(e);a||Oo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new mr),n.map=a,n.key=s),n.track()}}function za(e,t,s,a,n,i){const l=Oo.get(e);if(!l){_l++;return}const o=r=>{r&&r.trigger()};if(dd(),t==="clear")l.forEach(o);else{const r=Ie(e),c=r&&cr(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===wl||!gs(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(wl)),t){case"add":r?c&&o(l.get("length")):(o(l.get(Nn)),gi(e)&&o(l.get(wc)));break;case"delete":r||(o(l.get(Nn)),gi(e)&&o(l.get(wc)));break;case"set":gi(e)&&o(l.get(Nn));break}}ud()}function fb(e,t){const s=Oo.get(e);return s&&s.get(t)}function ai(e){const t=it(e);return t===e?t:(ms(t,"iterate",wl),Ms(e)?t:t.map(ra))}function hr(e){return ms(e=it(e),"iterate",wl),e}function xa(e,t){return wa(e)?Ci(Wa(e)?ra(t):t):ra(t)}const mb={__proto__:null,[Symbol.iterator](){return Kr(this,Symbol.iterator,e=>xa(this,e))},concat(...e){return ai(this).concat(...e.map(t=>Ie(t)?ai(t):t))},entries(){return Kr(this,"entries",e=>(e[1]=xa(this,e[1]),e))},every(e,t){return Na(this,"every",e,t,void 0,arguments)},filter(e,t){return Na(this,"filter",e,t,s=>s.map(a=>xa(this,a)),arguments)},find(e,t){return Na(this,"find",e,t,s=>xa(this,s),arguments)},findIndex(e,t){return Na(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Na(this,"findLast",e,t,s=>xa(this,s),arguments)},findLastIndex(e,t){return Na(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Na(this,"forEach",e,t,void 0,arguments)},includes(...e){return Jr(this,"includes",e)},indexOf(...e){return Jr(this,"indexOf",e)},join(e){return ai(this).join(e)},lastIndexOf(...e){return Jr(this,"lastIndexOf",e)},map(e,t){return Na(this,"map",e,t,void 0,arguments)},pop(){return Ki(this,"pop")},push(...e){return Ki(this,"push",e)},reduce(e,...t){return Su(this,"reduce",e,t)},reduceRight(e,...t){return Su(this,"reduceRight",e,t)},shift(){return Ki(this,"shift")},some(e,t){return Na(this,"some",e,t,void 0,arguments)},splice(...e){return Ki(this,"splice",e)},toReversed(){return ai(this).toReversed()},toSorted(e){return ai(this).toSorted(e)},toSpliced(...e){return ai(this).toSpliced(...e)},unshift(...e){return Ki(this,"unshift",e)},values(){return Kr(this,"values",e=>xa(this,e))}};function Kr(e,t,s){const a=hr(e),n=a[t]();return a!==e&&!Ms(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const hb=Array.prototype;function Na(e,t,s,a,n,i){const l=hr(e),o=l!==e&&!Ms(e),r=l[t];if(r!==hb[t]){const u=r.apply(e,i);return o?ra(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,xa(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Su(e,t,s,a){const n=hr(e),i=n!==e&&!Ms(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=xa(e,c)),s.call(this,c,xa(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?xa(e,r):r}function Jr(e,t,s){const a=it(e);ms(a,"iterate",wl);const n=a[t](...s);return(n===-1||n===!1)&&jl(s[0])?(s[0]=it(s[0]),a[t](...s)):n}function Ki(e,t,s=[]){Ya(),dd();const a=it(e)[t].apply(e,s);return ud(),Qa(),a}const vb=Hs("__proto__,__v_isRef,__isVue"),Kf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(gs));function gb(e){gs(e)||(e=String(e));const t=it(this);return ms(t,"has",e),t.hasOwnProperty(e)}class Jf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?tm:em:i?Xf:Qf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ie(t);if(!n){let r;if(l&&(r=mb[s]))return r;if(s==="hasOwnProperty")return gb}const o=Reflect.get(t,s,Ht(t)?t:a);if((gs(s)?Kf.has(s):vb(s))||(n||ms(t,"get",s),i))return o;if(Ht(o)){const r=l&&cr(s)?o:o.value;return n&&dt(r)?Lo(r):r}return dt(o)?n?Lo(o):yn(o):o}}class Zf extends Jf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ie(t)&&cr(s);if(!this._isShallow){const c=wa(i);if(!Ms(a)&&!wa(a)&&(i=it(i),a=it(a)),!l&&Ht(i)&&!Ht(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:ft(t,s),r=Reflect.set(t,s,a,Ht(t)?t:n);return t===it(n)&&(o?Qt(a,i)&&za(t,"set",s,a):za(t,"add",s,a)),r}deleteProperty(t,s){const a=ft(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&za(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!gs(s)||!Kf.has(s))&&ms(t,"has",s),a}ownKeys(t){return ms(t,"iterate",Ie(t)?"length":Nn),Reflect.ownKeys(t)}}class Yf extends Jf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const bb=new Zf,yb=new Yf,xb=new Zf(!0),_b=new Yf(!0),kc=e=>e,to=e=>Reflect.getPrototypeOf(e);function wb(e,t,s){return function(...a){const n=this.__v_raw,i=it(n),l=gi(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?kc:t?Ci:ra;return!t&&ms(i,"iterate",r?wc:Nn),tt(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function so(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function kb(e,t){const s={get(n){const i=this.__v_raw,l=it(i),o=it(n);e||(Qt(n,o)&&ms(l,"get",n),ms(l,"get",o));const{has:r}=to(l),c=t?kc:e?Ci:ra;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ms(it(n),"iterate",Nn),n.size},has(n){const i=this.__v_raw,l=it(i),o=it(n);return e||(Qt(n,o)&&ms(l,"has",n),ms(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=it(o),c=t?kc:e?Ci:ra;return!e&&ms(r,"iterate",Nn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return tt(s,e?{add:so("add"),set:so("set"),delete:so("delete"),clear:so("clear")}:{add(n){const i=it(this),l=to(i),o=it(n),r=!t&&!Ms(n)&&!wa(n)?o:n;return l.has.call(i,r)||Qt(n,r)&&l.has.call(i,n)||Qt(o,r)&&l.has.call(i,o)||(i.add(r),za(i,"add",r,r)),this},set(n,i){!t&&!Ms(i)&&!wa(i)&&(i=it(i));const l=it(this),{has:o,get:r}=to(l);let c=o.call(l,n);c||(n=it(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?Qt(i,d)&&za(l,"set",n,i):za(l,"add",n,i),this},delete(n){const i=it(this),{has:l,get:o}=to(i);let r=l.call(i,n);r||(n=it(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&za(i,"delete",n,void 0),c},clear(){const n=it(this),i=n.size!==0,l=n.clear();return i&&za(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=wb(n,e,t)}),s}function vr(e,t){const s=kb(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(ft(s,n)&&n in a?s:a,n,i)}const Sb={get:vr(!1,!1)},Tb={get:vr(!1,!0)},Cb={get:vr(!0,!1)},Eb={get:vr(!0,!0)},Qf=new WeakMap,Xf=new WeakMap,em=new WeakMap,tm=new WeakMap;function Ab(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function yn(e){return wa(e)?e:gr(e,!1,bb,Sb,Qf)}function fd(e){return gr(e,!1,xb,Tb,Xf)}function Lo(e){return gr(e,!0,yb,Cb,em)}function Rb(e){return gr(e,!0,_b,Eb,tm)}function gr(e,t,s,a,n){if(!dt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Ab($g(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Wa(e){return wa(e)?Wa(e.__v_raw):!!(e&&e.__v_isReactive)}function wa(e){return!!(e&&e.__v_isReadonly)}function Ms(e){return!!(e&&e.__v_isShallow)}function jl(e){return e?!!e.__v_raw:!1}function it(e){const t=e&&e.__v_raw;return t?it(t):e}function sm(e){return!ft(e,"__v_skip")&&Object.isExtensible(e)&&Mf(e,"__v_skip",!0),e}const ra=e=>dt(e)?yn(e):e,Ci=e=>dt(e)?Lo(e):e;function Ht(e){return e?e.__v_isRef===!0:!1}function f(e){return am(e,!1)}function md(e){return am(e,!0)}function am(e,t){return Ht(e)?e:new Ib(e,t)}class Ib{constructor(t,s){this.dep=new mr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:it(t),this._value=s?t:ra(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Ms(t)||wa(t);t=a?t:it(t),Qt(t,s)&&(this._rawValue=t,this._value=a?t:ra(t),this.dep.trigger())}}function Ob(e){e.dep&&e.dep.trigger()}function _a(e){return Ht(e)?e.value:e}function Lb(e){return Be(e)?e():_a(e)}const Nb={get:(e,t,s)=>t==="__v_raw"?e:_a(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Ht(n)&&!Ht(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function hd(e){return Wa(e)?e:new Proxy(e,Nb)}class Mb{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new mr,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function nm(e){return new Mb(e)}function Db(e){const t=Ie(e)?new Array(e.length):{};for(const s in e)t[s]=im(e,s);return t}class Pb{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=gs(s)?s:String(s),this._raw=it(t);let n=!0,i=t;if(!Ie(t)||gs(this._key)||!cr(this._key))do n=!jl(i)||Ms(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=_a(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Ht(this._raw[this._key])){const s=this._object[this._key];if(Ht(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return fb(this._raw,this._key)}}class Fb{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function $b(e,t,s){return Ht(e)?e:Be(e)?new Fb(e):dt(e)&&arguments.length>1?im(e,t,s):f(e)}function im(e,t,s){return new Pb(e,t,s)}class Ub{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new mr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=_l-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&Tt!==this)return Hf(this,!0),!0}get value(){const t=this.dep.track();return qf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Bb(e,t,s=!1){let a,n;return Be(e)?a=e:(a=e.get,n=e.set),new Ub(a,n,s)}const zb={GET:"get",HAS:"has",ITERATE:"iterate"},Hb={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},ao={},No=new WeakMap;let un;function jb(){return un}function lm(e,t=!1,s=un){if(s){let a=No.get(s);a||No.set(s,a=[]),a.push(e)}}function Vb(e,t,s=st){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:Ms(b)||n===!1||n===0?Ha(b,1):Ha(b);let d,u,p,m,h=!1,g=!1;if(Ht(e)?(u=()=>e.value,h=Ms(e)):Wa(e)?(u=()=>c(e),h=!0):Ie(e)?(g=!0,h=e.some(b=>Wa(b)||Ms(b)),u=()=>e.map(b=>{if(Ht(b))return b.value;if(Wa(b))return c(b);if(Be(b))return r?r(b,2):b()})):Be(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Ya();try{p()}finally{Qa()}}const b=un;un=d;try{return r?r(e,3,[m]):e(m)}finally{un=b}}:u=os,t&&n){const b=u,x=n===!0?1/0:n;u=()=>Ha(b(),x)}const R=Bf(),O=()=>{d.stop(),R&&R.active&&od(R.effects,d)};if(i&&t){const b=t;t=(...x)=>{const k=b(...x);return O(),k}}let y=g?new Array(e.length).fill(ao):ao;const v=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const x=d.run();if(b||n||h||(g?x.some((k,C)=>Qt(k,y[C])):Qt(x,y))){p&&p();const k=un;un=d;try{const C=[x,y===ao?void 0:g&&y[0]===ao?[]:y,m];y=x,r?r(t,3,C):t(...C)}finally{un=k}}}else d.run()};return o&&o(v),d=new xl(u),d.scheduler=l?()=>l(v,!1):v,m=b=>lm(b,!1,d),p=d.onStop=()=>{const b=No.get(d);if(b){if(r)r(b,4);else for(const x of b)x();No.delete(d)}},t?a?v(!0):y=d.run():l?l(v.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function Ha(e,t=1/0,s){if(t<=0||!dt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Ht(e))Ha(e.value,t,s);else if(Ie(e))for(let a=0;a<e.length;a++)Ha(e[a],t,s);else if(jn(e)||gi(e))e.forEach(a=>{Ha(a,t,s)});else if(rr(e)){for(const a in e)Ha(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ha(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const om=[];function qb(e){om.push(e)}function Gb(){om.pop()}function Wb(e,t){}const Kb={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Jb={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ui(e,t,s,a){try{return a?e(...a):e()}catch(n){qn(n,t,s)}}function zs(e,t,s,a){if(Be(e)){const n=Ui(e,t,s,a);return n&&rd(n)&&n.catch(i=>{qn(i,t,s)}),n}if(Ie(e)){const n=[];for(let i=0;i<e.length;i++)n.push(zs(e[i],t,s,a));return n}}function qn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||st;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Ya(),Ui(i,null,10,[e,r,c]),Qa();return}}Zb(e,s,n,a,l)}function Zb(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const ks=[];let ba=-1;const xi=[];let pn=null,ci=0;const rm=Promise.resolve();let Mo=null;function Pt(e){const t=Mo||rm;return e?t.then(this?e.bind(this):e):t}function Yb(e){let t=ba+1,s=ks.length;for(;t<s;){const a=t+s>>>1,n=ks[a],i=Sl(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function vd(e){if(!(e.flags&1)){const t=Sl(e),s=ks[ks.length-1];!s||!(e.flags&2)&&t>=Sl(s)?ks.push(e):ks.splice(Yb(t),0,e),e.flags|=1,cm()}}function cm(){Mo||(Mo=rm.then(dm))}function kl(e){Ie(e)?xi.push(...e):pn&&e.id===-1?pn.splice(ci+1,0,e):e.flags&1||(xi.push(e),e.flags|=1),cm()}function Tu(e,t,s=ba+1){for(;s<ks.length;s++){const a=ks[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;ks.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function Do(e){if(xi.length){const t=[...new Set(xi)].sort((s,a)=>Sl(s)-Sl(a));if(xi.length=0,pn){pn.push(...t);return}for(pn=t,ci=0;ci<pn.length;ci++){const s=pn[ci];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}pn=null,ci=0}}const Sl=e=>e.id==null?e.flags&2?-1:1/0:e.id;function dm(e){try{for(ba=0;ba<ks.length;ba++){const t=ks[ba];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ui(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;ba<ks.length;ba++){const t=ks[ba];t&&(t.flags&=-2)}ba=-1,ks.length=0,Do(),Mo=null,(ks.length||xi.length)&&dm()}}let di,no=[];function um(e,t){var s,a;di=e,di?(di.enabled=!0,no.forEach(({event:n,args:i})=>di.emit(n,...i)),no=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{um(i,t)}),setTimeout(()=>{di||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,no=[])},3e3)):no=[]}let ls=null,br=null;function Tl(e){const t=ls;return ls=e,br=e&&e.type.__scopeId||null,t}function Qb(e){br=e}function Xb(){br=null}const ey=e=>gd;function gd(e,t=ls,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&Rl(-1);const i=Tl(t);let l;try{l=e(...n)}finally{Tl(i),a._d&&Rl(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function ty(e,t){if(ls===null)return e;const s=Wl(ls),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=st]=t[n];i&&(Be(i)&&(i={mounted:i,updated:i}),i.deep&&Ha(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function ya(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Ya(),zs(r,s,8,[e.el,o,e,t]),Qa())}}function pl(e,t){if(is){let s=is.provides;const a=is.parent&&is.parent.provides;a===s&&(s=is.provides=Object.create(a)),s[e]=t}}function Xs(e,t,s=!1){const a=Ts();if(a||Mn){let n=Mn?Mn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Be(t)?t.call(a&&a.proxy):t}}function sy(){return!!(Ts()||Mn)}const pm=Symbol.for("v-scx"),fm=()=>Xs(pm);function ay(e,t){return Vl(e,null,t)}function ny(e,t){return Vl(e,null,{flush:"post"})}function mm(e,t){return Vl(e,null,{flush:"sync"})}function jt(e,t,s){return Vl(e,t,s)}function Vl(e,t,s=st){const{immediate:a,deep:n,flush:i,once:l}=s,o=tt({},s),r=t&&a||!t&&i!=="post";let c;if(Un){if(i==="sync"){const m=fm();c=m.__watcherHandles||(m.__watcherHandles=[])}else if(!r){const m=()=>{};return m.stop=os,m.resume=os,m.pause=os,m}}const d=is;o.call=(m,h,g)=>zs(m,d,h,g);let u=!1;i==="post"?o.scheduler=m=>{Bt(m,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(m,h)=>{h?m():vd(m)}),o.augmentJob=m=>{t&&(m.flags|=4),u&&(m.flags|=2,d&&(m.id=d.uid,m.i=d))};const p=Vb(e,t,o);return Un&&(c?c.push(p):r&&p()),p}function iy(e,t,s){const a=this.proxy,n=Ge(e)?e.includes(".")?hm(a,e):()=>a[e]:e.bind(a,a);let i;Be(t)?i=t:(i=t.handler,s=t);const l=Bi(this),o=Vl(n,i.bind(a),s);return l(),o}function hm(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const cn=new WeakMap,vm=Symbol("_vte"),gm=e=>e.__isTeleport,Rn=e=>e&&(e.disabled||e.disabled===""),ly=e=>e&&(e.defer||e.defer===""),Cu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Eu=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Sc=(e,t)=>{const s=e&&e.to;return Ge(s)?t?t(s):null:s},oy={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:m,querySelector:h,createText:g,createComment:R,parentNode:O}}=c,y=Rn(t.props);let{dynamicChildren:v}=t;const b=(C,A,_)=>{C.shapeFlag&16&&d(C.children,A,_,n,i,l,o,r)},x=(C=t)=>{const A=Rn(C.props),_=C.target=Sc(C.props,h),I=Tc(_,C,g,m);_&&(l!=="svg"&&Cu(_)?l="svg":l!=="mathml"&&Eu(_)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(_),A||(b(C,_,I),il(C,!1)))},k=C=>{const A=()=>{if(cn.get(C)===A){if(cn.delete(C),Rn(C.props)){const _=O(C.el)||s;b(C,_,C.anchor),il(C,!0)}x(C)}};cn.set(C,A),Bt(A,i)};if(e==null){const C=t.el=g(""),A=t.anchor=g("");if(m(C,s,a),m(A,s,a),ly(t.props)||i&&i.pendingBranch){k(t);return}y&&(b(t,s,A),il(t,!0)),x()}else{t.el=e.el;const C=t.anchor=e.anchor,A=cn.get(e);if(A){A.flags|=8,cn.delete(e),k(t);return}t.targetStart=e.targetStart;const _=t.target=e.target,I=t.targetAnchor=e.targetAnchor,U=Rn(e.props),T=U?s:_,F=U?C:I;if(l==="svg"||Cu(_)?l="svg":(l==="mathml"||Eu(_))&&(l="mathml"),v?(p(e.dynamicChildren,v,T,n,i,l,o),Ad(e,t,!0)):r||u(e,t,T,F,n,i,l,o,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):io(t,s,C,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Z=t.target=Sc(t.props,h);Z&&io(t,Z,null,c,0)}else U&&io(t,_,I,c,1);il(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,m=i||!Rn(p),h=cn.get(e);if(h&&(h.flags|=8,cn.delete(e)),u&&(n(c),n(d)),i&&n(r),!h&&l&16)for(let g=0;g<o.length;g++){const R=o[g];a(R,t,s,m,!!R.dynamicChildren)}},move:io,hydrate:ry};function io(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!cn.has(e)&&(!u||Rn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function ry(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(R,O){let y=O;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,R._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function m(R,O){O.anchor=u(l(R),O,o(R),s,a,n,i)}const h=t.target=Sc(t.props,r),g=Rn(t.props);if(h){const R=h._lpa||h.firstChild;t.shapeFlag&16&&(g?(m(e,t),p(h,R),t.targetAnchor||Tc(h,t,d,c,o(e)===h?e:null)):(t.anchor=l(e),p(h,R),t.targetAnchor||Tc(h,t,d,c),u(R&&l(R),t,h,s,a,n,i))),il(t,g)}else g&&t.shapeFlag&16&&(m(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const cy=oy;function il(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Tc(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[vm]=l,e&&(a(i,e,n),a(l,e,n)),l}const Js=Symbol("_leaveCb"),Ji=Symbol("_enterCb");function bd(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Qe(()=>{e.isMounted=!0}),wr(()=>{e.isUnmounting=!0}),e}const Ks=[Function,Array],yd={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ks,onEnter:Ks,onAfterEnter:Ks,onEnterCancelled:Ks,onBeforeLeave:Ks,onLeave:Ks,onAfterLeave:Ks,onLeaveCancelled:Ks,onBeforeAppear:Ks,onAppear:Ks,onAfterAppear:Ks,onAppearCancelled:Ks},bm=e=>{const t=e.subTree;return t.component?bm(t.component):t},dy={name:"BaseTransition",props:yd,setup(e,{slots:t}){const s=Ts(),a=bd();return()=>{const n=t.default&&yr(t.default(),!0),i=n&&n.length?ym(n):s.subTree?th():void 0;if(!i)return;const l=it(e),{mode:o}=l;if(a.isLeaving)return Zr(i);const r=Au(i);if(!r)return Zr(i);let c=Ei(r,l,a,s,u=>c=u);r.type!==Ft&&Xa(r,c);let d=s.subTree&&Au(s.subTree);if(d&&d.type!==Ft&&!ia(d,r)&&bm(s).type!==Ft){let u=Ei(d,l,a,s);if(Xa(d,u),o==="out-in"&&r.type!==Ft)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Zr(i);o==="in-out"&&r.type!==Ft?u.delayLeave=(p,m,h)=>{const g=_m(a,d);g[String(d.key)]=d,p[Js]=()=>{m(),p[Js]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{h(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function ym(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ft){t=s;break}}return t}const xm=dy;function _m(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function Ei(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:m,onAfterLeave:h,onLeaveCancelled:g,onBeforeAppear:R,onAppear:O,onAfterAppear:y,onAppearCancelled:v}=t,b=String(e.key),x=_m(s,e),k=(_,I)=>{_&&zs(_,a,9,I)},C=(_,I)=>{const U=I[1];k(_,I),Ie(_)?_.every(T=>T.length<=1)&&U():_.length<=1&&U()},A={mode:l,persisted:o,beforeEnter(_){let I=r;if(!s.isMounted)if(i)I=R||r;else return;_[Js]&&_[Js](!0);const U=x[b];U&&ia(e,U)&&U.el[Js]&&U.el[Js](),k(I,[_])},enter(_){if(x[b]===e)return;let I=c,U=d,T=u;if(!s.isMounted)if(i)I=O||c,U=y||d,T=v||u;else return;let F=!1;_[Ji]=W=>{F||(F=!0,W?k(T,[_]):k(U,[_]),A.delayedLeave&&A.delayedLeave(),_[Ji]=void 0)};const Z=_[Ji].bind(null,!1);I?C(I,[_,Z]):Z()},leave(_,I){const U=String(e.key);if(_[Ji]&&_[Ji](!0),s.isUnmounting)return I();k(p,[_]);let T=!1;_[Js]=Z=>{T||(T=!0,I(),Z?k(g,[_]):k(h,[_]),_[Js]=void 0,x[U]===e&&delete x[U])};const F=_[Js].bind(null,!1);x[U]=e,m?C(m,[_,F]):F()},clone(_){const I=Ei(_,t,s,a,n);return n&&n(I),I}};return A}function Zr(e){if(Gl(e))return e=ka(e),e.children=null,e}function Au(e){if(!Gl(e))return gm(e.type)&&e.children?ym(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Be(s.default))return s.default()}}function Xa(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Xa(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function yr(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Xt?(l.patchFlag&128&&n++,a=a.concat(yr(l.children,t,o))):(t||l.type!==Ft)&&a.push(o!=null?ka(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function ql(e,t){return Be(e)?tt({name:e.name},t,{setup:e}):e}function uy(){const e=Ts();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function xd(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function py(e){const t=Ts(),s=md(null);if(t){const n=t.refs===st?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Ru(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Po=new WeakMap;function _i(e,t,s,a,n=!1){if(Ie(e)){e.forEach((g,R)=>_i(g,t&&(Ie(t)?t[R]:t),s,a,n));return}if(Ka(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&_i(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?Wl(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===st?o.refs={}:o.refs,u=o.setupState,p=it(u),m=u===st?fi:g=>Ru(d,g)?!1:ft(p,g),h=(g,R)=>!(R&&Ru(d,R));if(c!=null&&c!==r){if(Iu(t),Ge(c))d[c]=null,m(c)&&(u[c]=null);else if(Ht(c)){const g=t;h(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(Be(r))Ui(r,o,12,[l,d]);else{const g=Ge(r),R=Ht(r);if(g||R){const O=()=>{if(e.f){const y=g?m(r)?u[r]:d[r]:h()||!e.k?r.value:d[e.k];if(n)Ie(y)&&od(y,i);else if(Ie(y))y.includes(i)||y.push(i);else if(g)d[r]=[i],m(r)&&(u[r]=d[r]);else{const v=[i];h(r,e.k)&&(r.value=v),e.k&&(d[e.k]=v)}}else g?(d[r]=l,m(r)&&(u[r]=l)):R&&(h(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{O(),Po.delete(e)};y.id=-1,Po.set(e,y),Bt(y,s)}else Iu(e),O()}}}function Iu(e){const t=Po.get(e);t&&(t.flags|=8,Po.delete(e))}let Ou=!1;const ni=()=>{Ou||(console.error("Hydration completed but contains mismatches."),Ou=!0)},fy=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",my=e=>e.namespaceURI.includes("MathML"),lo=e=>{if(e.nodeType===1){if(fy(e))return"svg";if(my(e))return"mathml"}},mi=e=>e.nodeType===8;function hy(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(v,b)=>{if(!b.hasChildNodes()){s(null,v,b),Do(),b._vnode=v;return}u(b.firstChild,v,null,null,null),Do(),b._vnode=v},u=(v,b,x,k,C,A=!1)=>{A=A||!!b.dynamicChildren;const _=mi(v)&&v.data==="[",I=()=>g(v,b,x,k,C,_),{type:U,ref:T,shapeFlag:F,patchFlag:Z}=b;let W=v.nodeType;b.el=v,Z===-2&&(A=!1,b.dynamicChildren=null);let M=null;switch(U){case vn:W!==3?b.children===""?(r(b.el=n(""),l(v),v),M=v):M=I():(v.data!==b.children&&(ni(),v.data=b.children),M=i(v));break;case Ft:y(v)?(M=i(v),O(b.el=v.content.firstChild,v,x)):W!==8||_?M=I():M=i(v);break;case Dn:if(_&&(v=i(v),W=v.nodeType),W===1||W===3){M=v;const L=!b.children.length;for(let D=0;D<b.staticCount;D++)L&&(b.children+=M.nodeType===1?M.outerHTML:M.data),D===b.staticCount-1&&(b.anchor=M),M=i(M);return _?i(M):M}else I();break;case Xt:_?M=h(v,b,x,k,C,A):M=I();break;default:if(F&1)(W!==1||b.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?M=I():M=p(v,b,x,k,C,A);else if(F&6){b.slotScopeIds=C;const L=l(v);if(_?M=R(v):mi(v)&&v.data==="teleport start"?M=R(v,v.data,"teleport end"):M=i(v),t(b,L,null,x,k,lo(L),A),Ka(b)&&!b.type.__asyncResolved){let D;_?(D=Rt(Xt),D.anchor=M?M.previousSibling:L.lastChild):D=v.nodeType===3?Id(""):Rt("div"),D.el=v,b.component.subTree=D}}else F&64?W!==8?M=I():M=b.type.hydrate(v,b,x,k,C,A,e,m):F&128&&(M=b.type.hydrate(v,b,x,k,lo(l(v)),C,A,e,u))}return T!=null&&_i(T,null,k,b),M},p=(v,b,x,k,C,A)=>{A=A||!!b.dynamicChildren;const{type:_,props:I,patchFlag:U,shapeFlag:T,dirs:F,transition:Z}=b,W=_==="input"||_==="option";if(W||U!==-1){F&&ya(b,null,x,"created");let M=!1;if(y(v)){M=Gm(null,Z)&&x&&x.vnode.props&&x.vnode.props.appear;const D=v.content.firstChild;if(M){const le=D.getAttribute("class");le&&(D.$cls=le),Z.beforeEnter(D)}O(D,v,x),b.el=v=D}if(T&16&&!(I&&(I.innerHTML||I.textContent))){let D=m(v.firstChild,b,v,x,k,C,A);for(D&&!oo(v,1)&&ni();D;){const le=D;D=D.nextSibling,o(le)}}else if(T&8){let D=b.children;D[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:le}=v;le!==D&&le!==D.replace(/\r\n|\r/g,`
`)&&(oo(v,0)||ni(),v.textContent=b.children)}if(I){if(W||!A||U&48){const D=v.tagName.includes("-");for(const le in I)(W&&(le.endsWith("value")||le==="indeterminate")||Hn(le)&&!Ga(le)||le[0]==="."||D&&!Ga(le))&&a(v,le,null,I[le],void 0,x)}else if(I.onClick)a(v,"onClick",null,I.onClick,void 0,x);else if(U&4&&Wa(I.style))for(const D in I.style)I.style[D]}let L;(L=I&&I.onVnodeBeforeMount)&&Rs(L,x,b),F&&ya(b,null,x,"beforeMount"),((L=I&&I.onVnodeMounted)||F||M)&&Zm(()=>{L&&Rs(L,x,b),M&&Z.enter(v),F&&ya(b,null,x,"mounted")},k)}return v.nextSibling},m=(v,b,x,k,C,A,_)=>{_=_||!!b.dynamicChildren;const I=b.children,U=I.length;let T=!1;for(let F=0;F<U;F++){const Z=_?I[F]:I[F]=Os(I[F]),W=Z.type===vn;v?(W&&!_&&F+1<U&&Os(I[F+1]).type===vn&&(r(n(v.data.slice(Z.children.length)),x,i(v)),v.data=Z.children),v=u(v,Z,k,C,A,_)):W&&!Z.children?r(Z.el=n(""),x):(T||(T=!0,oo(x,1)||ni()),s(null,Z,x,null,k,C,lo(x),A))}return v},h=(v,b,x,k,C,A)=>{const{slotScopeIds:_}=b;_&&(C=C?C.concat(_):_);const I=l(v),U=m(i(v),b,I,x,k,C,A);return U&&mi(U)&&U.data==="]"?i(b.anchor=U):(ni(),r(b.anchor=c("]"),I,U),U)},g=(v,b,x,k,C,A)=>{if(oo(v.parentElement,1)||ni(),b.el=null,A){const U=R(v);for(;;){const T=i(v);if(T&&T!==U)o(T);else break}}const _=i(v),I=l(v);return o(v),s(null,b,I,_,x,k,lo(I),C),x&&(x.vnode.el=b.el,Sr(x,b.el)),_},R=(v,b="[",x="]")=>{let k=0;for(;v;)if(v=i(v),v&&mi(v)&&(v.data===b&&k++,v.data===x)){if(k===0)return i(v);k--}return v},O=(v,b,x)=>{const k=b.parentNode;k&&k.replaceChild(v,b);let C=x;for(;C;)C.vnode.el===b&&(C.vnode.el=C.subTree.el=v),C=C.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[d,u]}const Lu="data-allow-mismatch",vy={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function oo(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Lu);)e=e.parentElement;const s=e&&e.getAttribute(Lu);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(vy[t])}}const gy=pr().requestIdleCallback||(e=>setTimeout(e,1)),by=pr().cancelIdleCallback||(e=>clearTimeout(e)),yy=(e=1e4)=>t=>{const s=gy(t,{timeout:e});return()=>by(s)};function xy(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const _y=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(xy(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},wy=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},ky=(e=[])=>(t,s)=>{Ge(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function Sy(e,t){if(mi(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(mi(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Ka=e=>!!e.type.__asyncLoader;function Ty(e){Be(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,m()),m=()=>{let h;return c||(h=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),r)return new Promise((R,O)=>{r(g,()=>R(p()),()=>O(g),u+1)});throw g}).then(g=>h!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return ql({name:"AsyncComponentWrapper",__asyncLoader:m,__asyncHydrate(h,g,R){let O=!1;(g.bu||(g.bu=[])).push(()=>O=!0);const y=()=>{O||R()},v=i?()=>{const b=i(y,x=>Sy(h,x));b&&(g.bum||(g.bum=[])).push(b)}:y;d?v():m().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return d},setup(){const h=is;if(xd(h),d)return()=>ro(d,h);const g=x=>{c=null,qn(x,h,13,!a)};if(o&&h.suspense||Un)return m().then(x=>()=>ro(x,h)).catch(x=>(g(x),()=>a?Rt(a,{error:x}):null));const R=f(!1),O=f(),y=f(!!n);let v,b;return bt(()=>{v!=null&&clearTimeout(v),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{h.isUnmounted||(y.value=!1)},n)),l!=null&&(v=setTimeout(()=>{if(!h.isUnmounted&&!R.value&&!O.value){const x=new Error(`Async component timed out after ${l}ms.`);g(x),O.value=x}},l)),m().then(()=>{h.isUnmounted||(R.value=!0,h.parent&&Gl(h.parent.vnode)&&h.parent.update())}).catch(x=>{if(h.isUnmounted){c=null;return}g(x),O.value=x}),()=>{if(R.value&&d)return ro(d,h);if(O.value&&a)return Rt(a,{error:O.value});if(s&&!y.value)return ro(s,h)}}})}function ro(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=Rt(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Gl=e=>e.type.__isKeepAlive,Cy={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Ts(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,v,b,x,k)=>{const C=y.component;c(y,v,b,0,o),r(C.vnode,y,v,b,C,o,x,y.slotScopeIds,k),Bt(()=>{C.isDeactivated=!1,C.a&&yi(C.a);const A=y.props&&y.props.onVnodeMounted;A&&Rs(A,C.parent,y)},o)},a.deactivate=y=>{const v=y.component;$o(v.m),$o(v.a),c(y,p,null,1,o),Bt(()=>{v.da&&yi(v.da);const b=y.props&&y.props.onVnodeUnmounted;b&&Rs(b,v.parent,y),v.isDeactivated=!0},o)};function m(y){Yr(y),d(y,s,o,!0)}function h(y){n.forEach((v,b)=>{const x=Mc(Ka(v)?v.type.__asyncResolved||{}:v.type);x&&!y(x)&&g(b)})}function g(y){const v=n.get(y);v&&(!l||!ia(v,l))?m(v):l&&Yr(l),n.delete(y),i.delete(y)}jt(()=>[e.include,e.exclude],([y,v])=>{y&&h(b=>ll(y,b)),v&&h(b=>!ll(v,b))},{flush:"post",deep:!0});let R=null;const O=()=>{R!=null&&(Uo(s.subTree.type)?Bt(()=>{n.set(R,co(s.subTree))},s.subTree.suspense):n.set(R,co(s.subTree)))};return Qe(O),_r(O),wr(()=>{n.forEach(y=>{const{subTree:v,suspense:b}=s,x=co(v);if(y.type===x.type&&y.key===x.key){Yr(x);const k=x.component.da;k&&Bt(k,b);return}m(y)})}),()=>{if(R=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!en(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let b=co(v);if(b.type===Ft)return l=null,b;const x=b.type,k=Mc(Ka(b)?b.type.__asyncResolved||{}:x),{include:C,exclude:A,max:_}=e;if(C&&(!k||!ll(C,k))||A&&k&&ll(A,k))return b.shapeFlag&=-257,l=b,v;const I=b.key==null?x:b.key,U=n.get(I);return b.el&&(b=ka(b),v.shapeFlag&128&&(v.ssContent=b)),R=I,U?(b.el=U.el,b.component=U.component,b.transition&&Xa(b,b.transition),b.shapeFlag|=512,i.delete(I),i.add(I)):(i.add(I),_&&i.size>parseInt(_,10)&&g(i.values().next().value)),b.shapeFlag|=256,l=b,Uo(v.type)?v:b}}},Ey=Cy;function ll(e,t){return Ie(e)?e.some(s=>ll(s,t)):Ge(e)?e.split(",").includes(t):Fg(e)?(e.lastIndex=0,e.test(t)):!1}function rs(e,t){wm(e,"a",t)}function Jt(e,t){wm(e,"da",t)}function wm(e,t,s=is){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(xr(t,a,s),s){let n=s.parent;for(;n&&n.parent;)Gl(n.parent.vnode)&&Ay(a,t,s,n),n=n.parent}}function Ay(e,t,s,a){const n=xr(t,e,a,!0);bt(()=>{od(a[t],n)},s)}function Yr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function co(e){return e.shapeFlag&128?e.ssContent:e}function xr(e,t,s=is,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Ya();const o=Bi(s),r=zs(t,s,e,l);return o(),Qa(),r});return a?n.unshift(i):n.push(i),i}}const tn=e=>(t,s=is)=>{(!Un||e==="sp")&&xr(e,(...a)=>t(...a),s)},km=tn("bm"),Qe=tn("m"),_d=tn("bu"),_r=tn("u"),wr=tn("bum"),bt=tn("um"),Sm=tn("sp"),Tm=tn("rtg"),Cm=tn("rtc");function Em(e,t=is){xr("ec",e,t)}const wd="components",Ry="directives";function Iy(e,t){return kd(wd,e,!0,t)||e}const Am=Symbol.for("v-ndc");function Oy(e){return Ge(e)?kd(wd,e,!1)||e:e||Am}function Ly(e){return kd(Ry,e)}function kd(e,t,s=!0,a=!1){const n=ls||is;if(n){const i=n.type;if(e===wd){const o=Mc(i,!1);if(o&&(o===t||o===_t(t)||o===Vn(_t(t))))return i}const l=Nu(n[e]||i[e],t)||Nu(n.appContext[e],t);return!l&&a?i:l}}function Nu(e,t){return e&&(e[t]||e[_t(t)]||e[Vn(_t(t))])}function Ny(e,t,s,a){let n;const i=s&&s[a],l=Ie(e);if(l||Ge(e)){const o=l&&Wa(e);let r=!1,c=!1;o&&(r=!Ms(e),c=wa(e),e=hr(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?Ci(ra(e[d])):ra(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(dt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function My(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ie(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Dy(e,t,s={},a,n){if(ls.ce||ls.parent&&Ka(ls.parent)&&ls.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Al(),Bo(Xt,null,[Rt("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Al();const l=i&&Sd(i(s)),o=s.key||l&&l.key,r=Bo(Xt,{key:(o&&!gs(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Sd(e){return e.some(t=>en(t)?!(t.type===Ft||t.type===Xt&&!Sd(t.children)):!0)?e:null}function Py(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:bi(a)]=e[a];return s}const Cc=e=>e?nh(e)?Wl(e):Cc(e.parent):null,fl=tt(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Cc(e.parent),$root:e=>Cc(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Td(e),$forceUpdate:e=>e.f||(e.f=()=>{vd(e.update)}),$nextTick:e=>e.n||(e.n=Pt.bind(e.proxy)),$watch:e=>iy.bind(e)}),Qr=(e,t)=>e!==st&&!e.__isScriptSetup&&ft(e,t),Ec={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(Qr(a,t))return l[t]=1,a[t];if(n!==st&&ft(n,t))return l[t]=2,n[t];if(ft(i,t))return l[t]=3,i[t];if(s!==st&&ft(s,t))return l[t]=4,s[t];Ac&&(l[t]=0)}}const c=fl[t];let d,u;if(c)return t==="$attrs"&&ms(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==st&&ft(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,ft(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return Qr(n,t)?(n[t]=s,!0):a!==st&&ft(a,t)?(a[t]=s,!0):ft(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==st&&o[0]!=="$"&&ft(e,o)||Qr(t,o)||ft(i,o)||ft(a,o)||ft(fl,o)||ft(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:ft(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Fy=tt({},Ec,{get(e,t){if(t!==Symbol.unscopables)return Ec.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Vg(t)}});function $y(){return null}function Uy(){return null}function By(e){}function zy(e){}function Hy(){return null}function jy(){}function Vy(e,t){return null}function qy(){return Rm().slots}function Gy(){return Rm().attrs}function Rm(e){const t=Ts();return t.setupContext||(t.setupContext=rh(t))}function Cl(e){return Ie(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Wy(e,t){const s=Cl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ie(n)||Be(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function Ky(e,t){return!e||!t?e||t:Ie(e)&&Ie(t)?e.concat(t):tt({},Cl(e),Cl(t))}function Jy(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Zy(e){const t=Ts(),s=Un;let a=e();Il(),s&&ki(!1);const n=()=>{Bi(t),s&&ki(!0)},i=()=>{Ts()!==t&&t.scope.off(),Il(),s&&ki(!1)};return rd(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Ac=!0;function Yy(e){const t=Td(e),s=e.proxy,a=e.ctx;Ac=!1,t.beforeCreate&&Mu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:m,updated:h,activated:g,deactivated:R,beforeDestroy:O,beforeUnmount:y,destroyed:v,unmounted:b,render:x,renderTracked:k,renderTriggered:C,errorCaptured:A,serverPrefetch:_,expose:I,inheritAttrs:U,components:T,directives:F,filters:Z}=t;if(c&&Qy(c,a,null),l)for(const L in l){const D=l[L];Be(D)&&(a[L]=D.bind(s))}if(n){const L=n.call(s,s);dt(L)&&(e.data=yn(L))}if(Ac=!0,i)for(const L in i){const D=i[L],le=Be(D)?D.bind(s,s):Be(D.get)?D.get.bind(s,s):os,ie=!Be(D)&&Be(D.set)?D.set.bind(s):os,B=j({get:le,set:ie});Object.defineProperty(a,L,{enumerable:!0,configurable:!0,get:()=>B.value,set:Q=>B.value=Q})}if(o)for(const L in o)Im(o[L],a,s,L);if(r){const L=Be(r)?r.call(s):r;Reflect.ownKeys(L).forEach(D=>{pl(D,L[D])})}d&&Mu(d,e,"c");function M(L,D){Ie(D)?D.forEach(le=>L(le.bind(s))):D&&L(D.bind(s))}if(M(km,u),M(Qe,p),M(_d,m),M(_r,h),M(rs,g),M(Jt,R),M(Em,A),M(Cm,k),M(Tm,C),M(wr,y),M(bt,b),M(Sm,_),Ie(I))if(I.length){const L=e.exposed||(e.exposed={});I.forEach(D=>{Object.defineProperty(L,D,{get:()=>s[D],set:le=>s[D]=le,enumerable:!0})})}else e.exposed||(e.exposed={});x&&e.render===os&&(e.render=x),U!=null&&(e.inheritAttrs=U),T&&(e.components=T),F&&(e.directives=F),_&&xd(e)}function Qy(e,t,s=os){Ie(e)&&(e=Rc(e));for(const a in e){const n=e[a];let i;dt(n)?"default"in n?i=Xs(n.from||a,n.default,!0):i=Xs(n.from||a):i=Xs(n),Ht(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function Mu(e,t,s){zs(Ie(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function Im(e,t,s,a){let n=a.includes(".")?hm(s,a):()=>s[a];if(Ge(e)){const i=t[e];Be(i)&&jt(n,i)}else if(Be(e))jt(n,e.bind(s));else if(dt(e))if(Ie(e))e.forEach(i=>Im(i,t,s,a));else{const i=Be(e.handler)?e.handler.bind(s):t[e.handler];Be(i)&&jt(n,i,e)}}function Td(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>Fo(r,c,l,!0)),Fo(r,t,l)),dt(t)&&i.set(t,r),r}function Fo(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&Fo(e,i,s,!0),n&&n.forEach(l=>Fo(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Xy[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Xy={data:Du,props:Pu,emits:Pu,methods:ol,computed:ol,beforeCreate:xs,created:xs,beforeMount:xs,mounted:xs,beforeUpdate:xs,updated:xs,beforeDestroy:xs,beforeUnmount:xs,destroyed:xs,unmounted:xs,activated:xs,deactivated:xs,errorCaptured:xs,serverPrefetch:xs,components:ol,directives:ol,watch:tx,provide:Du,inject:ex};function Du(e,t){return t?e?function(){return tt(Be(e)?e.call(this,this):e,Be(t)?t.call(this,this):t)}:t:e}function ex(e,t){return ol(Rc(e),Rc(t))}function Rc(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function xs(e,t){return e?[...new Set([].concat(e,t))]:t}function ol(e,t){return e?tt(Object.create(null),e,t):t}function Pu(e,t){return e?Ie(e)&&Ie(t)?[...new Set([...e,...t])]:tt(Object.create(null),Cl(e),Cl(t??{})):t}function tx(e,t){if(!e)return t;if(!t)return e;const s=tt(Object.create(null),e);for(const a in t)s[a]=xs(e[a],t[a]);return s}function Om(){return{app:null,config:{isNativeTag:fi,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let sx=0;function ax(e,t){return function(a,n=null){Be(a)||(a=tt({},a)),n!=null&&!dt(n)&&(n=null);const i=Om(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:sx++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:dh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Be(d.install)?(l.add(d),d.install(c,...u)):Be(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const m=c._ceVNode||Rt(a,n);return m.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(m,d):e(m,d,p),r=!0,c._container=d,d.__vue_app__=c,Wl(m.component)}},onUnmount(d){o.push(d)},unmount(){r&&(zs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Mn;Mn=c;try{return d()}finally{Mn=u}}};return c}}let Mn=null;function nx(e,t,s=st){const a=Ts(),n=_t(t),i=Ls(t),l=Lm(e,n),o=nm((r,c)=>{let d,u=st,p;return mm(()=>{const m=e[n];Qt(d,m)&&(d=m,c())}),{get(){return r(),s.get?s.get(d):d},set(m){const h=s.set?s.set(m):m;if(!Qt(h,d)&&!(u!==st&&Qt(m,u)))return;const g=a.vnode.props,R=!!(g&&(t in g||n in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${n}`in g||`onUpdate:${i}`in g));R||(d=m,c()),a.emit(`update:${t}`,h),Qt(m,u)&&(Qt(m,h)&&!Qt(h,p)||R&&u!==st&&!Qt(h,d))&&c(),u=m,p=h}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||st:o,done:!1}:{done:!0}}}},o}const Lm=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${_t(t)}Modifiers`]||e[`${Ls(t)}Modifiers`];function ix(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||st;let n=s;const i=t.startsWith("update:"),l=i&&Lm(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Ge(d)?d.trim():d)),l.number&&(n=s.map(ur)));let o,r=a[o=bi(t)]||a[o=bi(_t(t))];!r&&i&&(r=a[o=bi(Ls(t))]),r&&zs(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,zs(c,e,6,n)}}const lx=new WeakMap;function Nm(e,t,s=!1){const a=s?lx:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Be(e)){const r=c=>{const d=Nm(c,t,!0);d&&(o=!0,tt(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(dt(e)&&a.set(e,null),null):(Ie(i)?i.forEach(r=>l[r]=null):tt(l,i),dt(e)&&a.set(e,l),l)}function kr(e,t){return!e||!Hn(t)?!1:(t=t.slice(2).replace(/Once$/,""),ft(e,t[0].toLowerCase()+t.slice(1))||ft(e,Ls(t))||ft(e,t))}function wo(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:m,ctx:h,inheritAttrs:g}=e,R=Tl(e);let O,y;try{if(s.shapeFlag&4){const b=n||a,x=b;O=Os(c.call(x,b,d,u,m,p,h)),y=o}else{const b=t;O=Os(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:rx(o)}}catch(b){ml.length=0,qn(b,e,1),O=Rt(Ft)}let v=O;if(y&&g!==!1){const b=Object.keys(y),{shapeFlag:x}=v;b.length&&x&7&&(i&&b.some(or)&&(y=cx(y,i)),v=ka(v,y,!1,!0))}return s.dirs&&(v=ka(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&Xa(v,s.transition),O=v,Tl(R),O}function ox(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(en(n)){if(n.type!==Ft||n.children==="v-if"){if(s)return;s=n}}else return}return s}const rx=e=>{let t;for(const s in e)(s==="class"||s==="style"||Hn(s))&&((t||(t={}))[s]=e[s]);return t},cx=(e,t)=>{const s={};for(const a in e)(!or(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function dx(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?Fu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Mm(l,a,p)&&!kr(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?Fu(a,l,c):!0:!!l;return!1}function Fu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(Mm(t,e,i)&&!kr(s,i))return!0}return!1}function Mm(e,t,s){const a=e[s],n=t[s];return s==="style"&&dt(a)&&dt(n)?!Za(a,n):a!==n}function Sr({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const Dm={},Pm=()=>Object.create(Dm),Fm=e=>Object.getPrototypeOf(e)===Dm;function ux(e,t,s,a=!1){const n={},i=Pm();e.propsDefaults=Object.create(null),$m(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:fd(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function px(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=it(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(kr(e.emitsOptions,p))continue;const m=t[p];if(r)if(ft(i,p))m!==i[p]&&(i[p]=m,c=!0);else{const h=_t(p);n[h]=Ic(r,o,h,m,e,!1)}else m!==i[p]&&(i[p]=m,c=!0)}}}else{$m(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!ft(t,u)&&((d=Ls(u))===u||!ft(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=Ic(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!ft(t,u))&&(delete i[u],c=!0)}c&&za(e.attrs,"set","")}function $m(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ga(r))continue;const c=t[r];let d;n&&ft(n,d=_t(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:kr(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=it(s),c=o||st;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Ic(n,r,u,c[u],e,!ft(c,u))}}return l}function Ic(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=ft(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Be(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=Bi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===Ls(s))&&(a=!0))}return a}const fx=new WeakMap;function Um(e,t,s=!1){const a=s?fx:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Be(e)){const d=u=>{r=!0;const[p,m]=Um(u,t,!0);tt(l,p),m&&o.push(...m)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return dt(e)&&a.set(e,vi),vi;if(Ie(i))for(let d=0;d<i.length;d++){const u=_t(i[d]);$u(u)&&(l[u]=st)}else if(i)for(const d in i){const u=_t(d);if($u(u)){const p=i[d],m=l[u]=Ie(p)||Be(p)?{type:p}:tt({},p),h=m.type;let g=!1,R=!0;if(Ie(h))for(let O=0;O<h.length;++O){const y=h[O],v=Be(y)&&y.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(R=!1)}else g=Be(h)&&h.name==="Boolean";m[0]=g,m[1]=R,(g||ft(m,"default"))&&o.push(u)}}const c=[l,o];return dt(e)&&a.set(e,c),c}function $u(e){return e[0]!=="$"&&!Ga(e)}const Cd=e=>e==="_"||e==="_ctx"||e==="$stable",Ed=e=>Ie(e)?e.map(Os):[Os(e)],mx=(e,t,s)=>{if(t._n)return t;const a=gd((...n)=>Ed(t(...n)),s);return a._c=!1,a},Bm=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Cd(n))continue;const i=e[n];if(Be(i))t[n]=mx(n,i,a);else if(i!=null){const l=Ed(i);t[n]=()=>l}}},zm=(e,t)=>{const s=Ed(t);e.slots.default=()=>s},Hm=(e,t,s)=>{for(const a in t)(s||!Cd(a))&&(e[a]=t[a])},hx=(e,t,s)=>{const a=e.slots=Pm();if(e.vnode.shapeFlag&32){const n=t._;n?(Hm(a,t,s),s&&Mf(a,"_",n,!0)):Bm(t,a)}else t&&zm(e,t)},vx=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=st;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Hm(n,t,s):(i=!t.$stable,Bm(t,n)),l=t}else t&&(zm(e,t),l={default:1});if(i)for(const o in n)!Cd(o)&&l[o]==null&&delete n[o]},Bt=Zm;function jm(e){return qm(e)}function Vm(e){return qm(e,hy)}function qm(e,t){const s=pr();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:m=os,insertStaticContent:h}=e,g=(E,P,V,pe=null,$=null,Y=null,ue=void 0,H=null,te=!!P.dynamicChildren)=>{if(E===P)return;E&&!ia(E,P)&&(pe=K(E),Q(E,$,Y,!0),E=null),P.patchFlag===-2&&(te=!1,P.dynamicChildren=null);const{type:X,ref:be,shapeFlag:ge}=P;switch(X){case vn:R(E,P,V,pe);break;case Ft:O(E,P,V,pe);break;case Dn:E==null&&y(P,V,pe,ue);break;case Xt:T(E,P,V,pe,$,Y,ue,H,te);break;default:ge&1?x(E,P,V,pe,$,Y,ue,H,te):ge&6?F(E,P,V,pe,$,Y,ue,H,te):(ge&64||ge&128)&&X.process(E,P,V,pe,$,Y,ue,H,te,ye)}be!=null&&$?_i(be,E&&E.ref,Y,P||E,!P):be==null&&E&&E.ref!=null&&_i(E.ref,null,Y,E,!0)},R=(E,P,V,pe)=>{if(E==null)a(P.el=o(P.children),V,pe);else{const $=P.el=E.el;P.children!==E.children&&c($,P.children)}},O=(E,P,V,pe)=>{E==null?a(P.el=r(P.children||""),V,pe):P.el=E.el},y=(E,P,V,pe)=>{[E.el,E.anchor]=h(E.children,P,V,pe,E.el,E.anchor)},v=({el:E,anchor:P},V,pe)=>{let $;for(;E&&E!==P;)$=p(E),a(E,V,pe),E=$;a(P,V,pe)},b=({el:E,anchor:P})=>{let V;for(;E&&E!==P;)V=p(E),n(E),E=V;n(P)},x=(E,P,V,pe,$,Y,ue,H,te)=>{if(P.type==="svg"?ue="svg":P.type==="math"&&(ue="mathml"),E==null)k(P,V,pe,$,Y,ue,H,te);else{const X=E.el&&E.el._isVueCE?E.el:null;try{X&&X._beginPatch(),_(E,P,$,Y,ue,H,te)}finally{X&&X._endPatch()}}},k=(E,P,V,pe,$,Y,ue,H)=>{let te,X;const{props:be,shapeFlag:ge,transition:me,dirs:Te}=E;if(te=E.el=l(E.type,Y,be&&be.is,be),ge&8?d(te,E.children):ge&16&&A(E.children,te,null,pe,$,Xr(E,Y),ue,H),Te&&ya(E,null,pe,"created"),C(te,E,E.scopeId,ue,pe),be){for(const je in be)je!=="value"&&!Ga(je)&&i(te,je,null,be[je],Y,pe);"value"in be&&i(te,"value",null,be.value,Y),(X=be.onVnodeBeforeMount)&&Rs(X,pe,E)}Te&&ya(E,null,pe,"beforeMount");const De=Gm($,me);De&&me.beforeEnter(te),a(te,P,V),((X=be&&be.onVnodeMounted)||De||Te)&&Bt(()=>{try{X&&Rs(X,pe,E),De&&me.enter(te),Te&&ya(E,null,pe,"mounted")}finally{}},$)},C=(E,P,V,pe,$)=>{if(V&&m(E,V),pe)for(let Y=0;Y<pe.length;Y++)m(E,pe[Y]);if($){let Y=$.subTree;if(P===Y||Uo(Y.type)&&(Y.ssContent===P||Y.ssFallback===P)){const ue=$.vnode;C(E,ue,ue.scopeId,ue.slotScopeIds,$.parent)}}},A=(E,P,V,pe,$,Y,ue,H,te=0)=>{for(let X=te;X<E.length;X++){const be=E[X]=H?Ua(E[X]):Os(E[X]);g(null,be,P,V,pe,$,Y,ue,H)}},_=(E,P,V,pe,$,Y,ue)=>{const H=P.el=E.el;let{patchFlag:te,dynamicChildren:X,dirs:be}=P;te|=E.patchFlag&16;const ge=E.props||st,me=P.props||st;let Te;if(V&&Sn(V,!1),(Te=me.onVnodeBeforeUpdate)&&Rs(Te,V,P,E),be&&ya(P,E,V,"beforeUpdate"),V&&Sn(V,!0),(ge.innerHTML&&me.innerHTML==null||ge.textContent&&me.textContent==null)&&d(H,""),X?I(E.dynamicChildren,X,H,V,pe,Xr(P,$),Y):ue||D(E,P,H,null,V,pe,Xr(P,$),Y,!1),te>0){if(te&16)U(H,ge,me,V,$);else if(te&2&&ge.class!==me.class&&i(H,"class",null,me.class,$),te&4&&i(H,"style",ge.style,me.style,$),te&8){const De=P.dynamicProps;for(let je=0;je<De.length;je++){const ze=De[je],qe=ge[ze],We=me[ze];(We!==qe||ze==="value")&&i(H,ze,qe,We,$,V)}}te&1&&E.children!==P.children&&d(H,P.children)}else!ue&&X==null&&U(H,ge,me,V,$);((Te=me.onVnodeUpdated)||be)&&Bt(()=>{Te&&Rs(Te,V,P,E),be&&ya(P,E,V,"updated")},pe)},I=(E,P,V,pe,$,Y,ue)=>{for(let H=0;H<P.length;H++){const te=E[H],X=P[H],be=te.el&&(te.type===Xt||!ia(te,X)||te.shapeFlag&198)?u(te.el):V;g(te,X,be,null,pe,$,Y,ue,!0)}},U=(E,P,V,pe,$)=>{if(P!==V){if(P!==st)for(const Y in P)!Ga(Y)&&!(Y in V)&&i(E,Y,P[Y],null,$,pe);for(const Y in V){if(Ga(Y))continue;const ue=V[Y],H=P[Y];ue!==H&&Y!=="value"&&i(E,Y,H,ue,$,pe)}"value"in V&&i(E,"value",P.value,V.value,$)}},T=(E,P,V,pe,$,Y,ue,H,te)=>{const X=P.el=E?E.el:o(""),be=P.anchor=E?E.anchor:o("");let{patchFlag:ge,dynamicChildren:me,slotScopeIds:Te}=P;Te&&(H=H?H.concat(Te):Te),E==null?(a(X,V,pe),a(be,V,pe),A(P.children||[],V,be,$,Y,ue,H,te)):ge>0&&ge&64&&me&&E.dynamicChildren&&E.dynamicChildren.length===me.length?(I(E.dynamicChildren,me,V,$,Y,ue,H),(P.key!=null||$&&P===$.subTree)&&Ad(E,P,!0)):D(E,P,V,be,$,Y,ue,H,te)},F=(E,P,V,pe,$,Y,ue,H,te)=>{P.slotScopeIds=H,E==null?P.shapeFlag&512?$.ctx.activate(P,V,pe,ue,te):Z(P,V,pe,$,Y,ue,te):W(E,P,te)},Z=(E,P,V,pe,$,Y,ue)=>{const H=E.component=ah(E,pe,$);if(Gl(E)&&(H.ctx.renderer=ye),ih(H,!1,ue),H.asyncDep){if($&&$.registerDep(H,M,ue),!E.el){const te=H.subTree=Rt(Ft);O(null,te,P,V),E.placeholder=te.el}}else M(H,E,P,V,$,Y,ue)},W=(E,P,V)=>{const pe=P.component=E.component;if(dx(E,P,V))if(pe.asyncDep&&!pe.asyncResolved){L(pe,P,V);return}else pe.next=P,pe.update();else P.el=E.el,pe.vnode=P},M=(E,P,V,pe,$,Y,ue)=>{const H=()=>{if(E.isMounted){let{next:ge,bu:me,u:Te,parent:De,vnode:je}=E;{const Ke=Wm(E);if(Ke){ge&&(ge.el=je.el,L(E,ge,ue)),Ke.asyncDep.then(()=>{Bt(()=>{E.isUnmounted||X()},$)});return}}let ze=ge,qe;Sn(E,!1),ge?(ge.el=je.el,L(E,ge,ue)):ge=je,me&&yi(me),(qe=ge.props&&ge.props.onVnodeBeforeUpdate)&&Rs(qe,De,ge,je),Sn(E,!0);const We=wo(E),ot=E.subTree;E.subTree=We,g(ot,We,u(ot.el),K(ot),E,$,Y),ge.el=We.el,ze===null&&Sr(E,We.el),Te&&Bt(Te,$),(qe=ge.props&&ge.props.onVnodeUpdated)&&Bt(()=>Rs(qe,De,ge,je),$)}else{let ge;const{el:me,props:Te}=P,{bm:De,m:je,parent:ze,root:qe,type:We}=E,ot=Ka(P);if(Sn(E,!1),De&&yi(De),!ot&&(ge=Te&&Te.onVnodeBeforeMount)&&Rs(ge,ze,P),Sn(E,!0),me&&$e){const Ke=()=>{E.subTree=wo(E),$e(me,E.subTree,E,$,null)};ot&&We.__asyncHydrate?We.__asyncHydrate(me,E,Ke):Ke()}else{qe.ce&&qe.ce._hasShadowRoot()&&qe.ce._injectChildStyle(We,E.parent?E.parent.type:void 0);const Ke=E.subTree=wo(E);g(null,Ke,V,pe,E,$,Y),P.el=Ke.el}if(je&&Bt(je,$),!ot&&(ge=Te&&Te.onVnodeMounted)){const Ke=P;Bt(()=>Rs(ge,ze,Ke),$)}(P.shapeFlag&256||ze&&Ka(ze.vnode)&&ze.vnode.shapeFlag&256)&&E.a&&Bt(E.a,$),E.isMounted=!0,P=V=pe=null}};E.scope.on();const te=E.effect=new xl(H);E.scope.off();const X=E.update=te.run.bind(te),be=E.job=te.runIfDirty.bind(te);be.i=E,be.id=E.uid,te.scheduler=()=>vd(be),Sn(E,!0),X()},L=(E,P,V)=>{P.component=E;const pe=E.vnode.props;E.vnode=P,E.next=null,px(E,P.props,pe,V),vx(E,P.children,V),Ya(),Tu(E),Qa()},D=(E,P,V,pe,$,Y,ue,H,te=!1)=>{const X=E&&E.children,be=E?E.shapeFlag:0,ge=P.children,{patchFlag:me,shapeFlag:Te}=P;if(me>0){if(me&128){ie(X,ge,V,pe,$,Y,ue,H,te);return}else if(me&256){le(X,ge,V,pe,$,Y,ue,H,te);return}}Te&8?(be&16&&ne(X,$,Y),ge!==X&&d(V,ge)):be&16?Te&16?ie(X,ge,V,pe,$,Y,ue,H,te):ne(X,$,Y,!0):(be&8&&d(V,""),Te&16&&A(ge,V,pe,$,Y,ue,H,te))},le=(E,P,V,pe,$,Y,ue,H,te)=>{E=E||vi,P=P||vi;const X=E.length,be=P.length,ge=Math.min(X,be);let me;for(me=0;me<ge;me++){const Te=P[me]=te?Ua(P[me]):Os(P[me]);g(E[me],Te,V,null,$,Y,ue,H,te)}X>be?ne(E,$,Y,!0,!1,ge):A(P,V,pe,$,Y,ue,H,te,ge)},ie=(E,P,V,pe,$,Y,ue,H,te)=>{let X=0;const be=P.length;let ge=E.length-1,me=be-1;for(;X<=ge&&X<=me;){const Te=E[X],De=P[X]=te?Ua(P[X]):Os(P[X]);if(ia(Te,De))g(Te,De,V,null,$,Y,ue,H,te);else break;X++}for(;X<=ge&&X<=me;){const Te=E[ge],De=P[me]=te?Ua(P[me]):Os(P[me]);if(ia(Te,De))g(Te,De,V,null,$,Y,ue,H,te);else break;ge--,me--}if(X>ge){if(X<=me){const Te=me+1,De=Te<be?P[Te].el:pe;for(;X<=me;)g(null,P[X]=te?Ua(P[X]):Os(P[X]),V,De,$,Y,ue,H,te),X++}}else if(X>me)for(;X<=ge;)Q(E[X],$,Y,!0),X++;else{const Te=X,De=X,je=new Map;for(X=De;X<=me;X++){const Ae=P[X]=te?Ua(P[X]):Os(P[X]);Ae.key!=null&&je.set(Ae.key,X)}let ze,qe=0;const We=me-De+1;let ot=!1,Ke=0;const ee=new Array(We);for(X=0;X<We;X++)ee[X]=0;for(X=Te;X<=ge;X++){const Ae=E[X];if(qe>=We){Q(Ae,$,Y,!0);continue}let Le;if(Ae.key!=null)Le=je.get(Ae.key);else for(ze=De;ze<=me;ze++)if(ee[ze-De]===0&&ia(Ae,P[ze])){Le=ze;break}Le===void 0?Q(Ae,$,Y,!0):(ee[Le-De]=X+1,Le>=Ke?Ke=Le:ot=!0,g(Ae,P[Le],V,null,$,Y,ue,H,te),qe++)}const we=ot?gx(ee):vi;for(ze=we.length-1,X=We-1;X>=0;X--){const Ae=De+X,Le=P[Ae],ae=P[Ae+1],Oe=Ae+1<be?ae.el||Km(ae):pe;ee[X]===0?g(null,Le,V,Oe,$,Y,ue,H,te):ot&&(ze<0||X!==we[ze]?B(Le,V,Oe,2):ze--)}}},B=(E,P,V,pe,$=null)=>{const{el:Y,type:ue,transition:H,children:te,shapeFlag:X}=E;if(X&6){B(E.component.subTree,P,V,pe);return}if(X&128){E.suspense.move(P,V,pe);return}if(X&64){ue.move(E,P,V,ye);return}if(ue===Xt){a(Y,P,V);for(let ge=0;ge<te.length;ge++)B(te[ge],P,V,pe);a(E.anchor,P,V);return}if(ue===Dn){v(E,P,V);return}if(pe!==2&&X&1&&H)if(pe===0)H.persisted&&!Y[Js]?a(Y,P,V):(H.beforeEnter(Y),a(Y,P,V),Bt(()=>H.enter(Y),$));else{const{leave:ge,delayLeave:me,afterLeave:Te}=H,De=()=>{E.ctx.isUnmounted?n(Y):a(Y,P,V)},je=()=>{const ze=Y._isLeaving||!!Y[Js];Y._isLeaving&&Y[Js](!0),H.persisted&&!ze?De():ge(Y,()=>{De(),Te&&Te()})};me?me(Y,De,je):je()}else a(Y,P,V)},Q=(E,P,V,pe=!1,$=!1)=>{const{type:Y,props:ue,ref:H,children:te,dynamicChildren:X,shapeFlag:be,patchFlag:ge,dirs:me,cacheIndex:Te,memo:De}=E;if(ge===-2&&($=!1),H!=null&&(Ya(),_i(H,null,V,E,!0),Qa()),Te!=null&&(P.renderCache[Te]=void 0),be&256){P.ctx.deactivate(E);return}const je=be&1&&me,ze=!Ka(E);let qe;if(ze&&(qe=ue&&ue.onVnodeBeforeUnmount)&&Rs(qe,P,E),be&6)fe(E.component,V,pe);else{if(be&128){E.suspense.unmount(V,pe);return}je&&ya(E,null,P,"beforeUnmount"),be&64?E.type.remove(E,P,V,ye,pe):X&&!X.hasOnce&&(Y!==Xt||ge>0&&ge&64)?ne(X,P,V,!1,!0):(Y===Xt&&ge&384||!$&&be&16)&&ne(te,P,V),pe&&re(E)}const We=De!=null&&Te==null;(ze&&(qe=ue&&ue.onVnodeUnmounted)||je||We)&&Bt(()=>{qe&&Rs(qe,P,E),je&&ya(E,null,P,"unmounted"),We&&(E.el=null)},V)},re=E=>{const{type:P,el:V,anchor:pe,transition:$}=E;if(P===Xt){J(V,pe);return}if(P===Dn){b(E);return}const Y=()=>{n(V),$&&!$.persisted&&$.afterLeave&&$.afterLeave()};if(E.shapeFlag&1&&$&&!$.persisted){const{leave:ue,delayLeave:H}=$,te=()=>ue(V,Y);H?H(E.el,Y,te):te()}else Y()},J=(E,P)=>{let V;for(;E!==P;)V=p(E),n(E),E=V;n(P)},fe=(E,P,V)=>{const{bum:pe,scope:$,job:Y,subTree:ue,um:H,m:te,a:X}=E;$o(te),$o(X),pe&&yi(pe),$.stop(),Y&&(Y.flags|=8,Q(ue,E,P,V)),H&&Bt(H,P),Bt(()=>{E.isUnmounted=!0},P)},ne=(E,P,V,pe=!1,$=!1,Y=0)=>{for(let ue=Y;ue<E.length;ue++)Q(E[ue],P,V,pe,$)},K=E=>{if(E.shapeFlag&6)return K(E.component.subTree);if(E.shapeFlag&128)return E.suspense.next();const P=p(E.anchor||E.el),V=P&&P[vm];return V?p(V):P};let he=!1;const ve=(E,P,V)=>{let pe;E==null?P._vnode&&(Q(P._vnode,null,null,!0),pe=P._vnode.component):g(P._vnode||null,E,P,null,null,null,V),P._vnode=E,he||(he=!0,Tu(pe),Do(),he=!1)},ye={p:g,um:Q,m:B,r:re,mt:Z,mc:A,pc:D,pbc:I,n:K,o:e};let _e,$e;return t&&([_e,$e]=t(ye)),{render:ve,hydrate:_e,createApp:ax(ve,_e)}}function Xr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Sn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Gm(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Ad(e,t,s=!1){const a=e.children,n=t.children;if(Ie(a)&&Ie(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=Ua(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Ad(l,o)),o.type===vn&&(o.patchFlag===-1&&(o=n[i]=Ua(o)),o.el=l.el),o.type===Ft&&!o.el&&(o.el=l.el)}}function gx(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Wm(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Wm(t)}function $o(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Km(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Km(t.subTree):null}const Uo=e=>e.__isSuspense;let Oc=0;const bx={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)xx(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}_x(e,t,s,a,n,l,o,r,c)}},hydrate:wx,normalize:kx},yx=bx;function El(e,t){const s=e.props&&e.props[t];Be(s)&&s()}function xx(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Jm(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(El(e,"onPending"),El(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),wi(p,e.ssFallback)):p.resolve(!1,!0)}function _x(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,m=t.ssFallback,{activeBranch:h,pendingBranch:g,isInFallback:R,isHydrating:O}=u;if(g)u.pendingBranch=p,ia(g,p)?(r(g,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():R&&(O||(r(h,m,s,a,n,null,i,l,o),wi(u,m)))):(u.pendingId=Oc++,O?(u.isHydrating=!1,u.activeBranch=g):c(g,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),R?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(h,m,s,a,n,null,i,l,o),wi(u,m))):h&&ia(h,p)?(r(h,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(h&&ia(h,p))r(h,p,s,a,n,u,i,l,o),wi(u,p);else if(El(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Oc++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:v}=u;y>0?setTimeout(()=>{u.pendingId===v&&u.fallback(m)},y):y===0&&u.fallback(m)}}function Jm(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:m,n:h,o:{parentNode:g,remove:R}}=c;let O;const y=Sx(e);y&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const v=e.props?Io(e.props.timeout):void 0,b=i,x={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:Oc++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,C=!1){const{vnode:A,activeBranch:_,pendingBranch:I,pendingId:U,effects:T,parentComponent:F,container:Z,isInFallback:W}=x;let M=!1;if(x.isHydrating)x.isHydrating=!1;else if(!k){M=_&&I.transition&&I.transition.mode==="out-in";let le=!1;M&&(_.transition.afterLeave=()=>{U===x.pendingId&&(p(I,Z,i===b&&!le?h(_):i,0),kl(T),W&&A.ssFallback&&(A.ssFallback.el=null))}),_&&!x.isFallbackMountPending&&(g(_.el)===Z&&(i=h(_),le=!0),m(_,F,x,!0),!M&&W&&A.ssFallback&&Bt(()=>A.ssFallback.el=null,x)),M||p(I,Z,i,0)}x.isFallbackMountPending=!1,wi(x,I),x.pendingBranch=null,x.isInFallback=!1;let L=x.parent,D=!1;for(;L;){if(L.pendingBranch){L.effects.push(...T),D=!0;break}L=L.parent}!D&&!M&&kl(T),x.effects=[],y&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!C&&t.resolve()),El(A,"onResolve")},fallback(k){if(!x.pendingBranch)return;const{vnode:C,activeBranch:A,parentComponent:_,container:I,namespace:U}=x;El(C,"onFallback");const T=h(A),F=()=>{x.isFallbackMountPending=!1,x.isInFallback&&(u(null,k,I,T,_,null,U,o,r),wi(x,k))},Z=k.transition&&k.transition.mode==="out-in";Z&&(x.isFallbackMountPending=!0,A.transition.afterLeave=F),x.isInFallback=!0,m(A,_,null,!0),Z||F()},move(k,C,A){x.activeBranch&&p(x.activeBranch,k,C,A),x.container=k},next(){return x.activeBranch&&h(x.activeBranch)},registerDep(k,C,A){const _=!!x.pendingBranch;_&&x.deps++;const I=k.vnode.el;k.asyncDep.catch(U=>{qn(U,k,0)}).then(U=>{if(k.isUnmounted||x.isUnmounted||x.pendingId!==k.suspenseId)return;Il(),k.asyncResolved=!0;const{vnode:T}=k;Lc(k,U,!1),I&&(T.el=I);const F=!I&&k.subTree.el;C(k,T,g(I||k.subTree.el),I?null:h(k.subTree),x,l,A),F&&(T.placeholder=null,R(F)),Sr(k,T.el),_&&--x.deps===0&&x.resolve()})},unmount(k,C){x.isUnmounted=!0,x.activeBranch&&m(x.activeBranch,s,k,C),x.pendingBranch&&m(x.pendingBranch,s,k,C)}};return x}function wx(e,t,s,a,n,i,l,o,r){const c=t.suspense=Jm(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function kx(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=Uu(a?s.default:s),e.ssFallback=a?Uu(s.fallback):Rt(Ft)}function Uu(e){let t;if(Be(e)){const s=$n&&e._c;s&&(e._d=!1,Al()),e=e(),s&&(e._d=!0,t=hs,Ym())}return Ie(e)&&(e=ox(e)),e=Os(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Zm(e,t){t&&t.pendingBranch?Ie(e)?t.effects.push(...e):t.effects.push(e):kl(e)}function wi(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Sr(a,n))}function Sx(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Xt=Symbol.for("v-fgt"),vn=Symbol.for("v-txt"),Ft=Symbol.for("v-cmt"),Dn=Symbol.for("v-stc"),ml=[];let hs=null;function Al(e=!1){ml.push(hs=e?null:[])}function Ym(){ml.pop(),hs=ml[ml.length-1]||null}let $n=1;function Rl(e,t=!1){$n+=e,e<0&&hs&&t&&(hs.hasOnce=!0)}function Qm(e){return e.dynamicChildren=$n>0?hs||vi:null,Ym(),$n>0&&hs&&hs.push(e),e}function Tx(e,t,s,a,n,i){return Qm(Rd(e,t,s,a,n,i,!0))}function Bo(e,t,s,a,n){return Qm(Rt(e,t,s,a,n,!0))}function en(e){return e?e.__v_isVNode===!0:!1}function ia(e,t){return e.type===t.type&&e.key===t.key}function Cx(e){}const Xm=({key:e})=>e??null,ko=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ge(e)||Ht(e)||Be(e)?{i:ls,r:e,k:t,f:!!s}:e:null);function Rd(e,t=null,s=null,a=0,n=null,i=e===Xt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Xm(t),ref:t&&ko(t),scopeId:br,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:ls};return o?(Od(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ge(s)?8:16),$n>0&&!l&&hs&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&hs.push(r),r}const Rt=Ex;function Ex(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===Am)&&(e=Ft),en(e)){const o=ka(e,t,!0);return s&&Od(o,s),$n>0&&!i&&hs&&(o.shapeFlag&6?hs[hs.indexOf(e)]=o:hs.push(o)),o.patchFlag=-2,o}if(Mx(e)&&(e=e.__vccOpts),t){t=eh(t);let{class:o,style:r}=t;o&&!Ge(o)&&(t.class=Hl(o)),dt(r)&&(jl(r)&&!Ie(r)&&(r=tt({},r)),t.style=zl(r))}const l=Ge(e)?1:Uo(e)?128:gm(e)?64:dt(e)?4:Be(e)?2:0;return Rd(e,t,s,a,n,l,i,!0)}function eh(e){return e?jl(e)||Fm(e)?tt({},e):e:null}function ka(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?sh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Xm(c),ref:t&&t.ref?s&&i?Ie(i)?i.concat(ko(t)):[i,ko(t)]:ko(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Xt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ka(e.ssContent),ssFallback:e.ssFallback&&ka(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&Xa(d,r.clone(d)),d}function Id(e=" ",t=0){return Rt(vn,null,e,t)}function Ax(e,t){const s=Rt(Dn,null,e);return s.staticCount=t,s}function th(e="",t=!1){return t?(Al(),Bo(Ft,null,e)):Rt(Ft,null,e)}function Os(e){return e==null||typeof e=="boolean"?Rt(Ft):Ie(e)?Rt(Xt,null,e.slice()):en(e)?Ua(e):Rt(vn,null,String(e))}function Ua(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ka(e)}function Od(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ie(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),Od(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!Fm(t)?t._ctx=ls:n===3&&ls&&(ls.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Be(t)?(t={default:t,_ctx:ls},s=32):(t=String(t),a&64?(s=16,t=[Id(t)]):s=8);e.children=t,e.shapeFlag|=s}function sh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=Hl([t.class,a.class]));else if(n==="style")t.style=zl([t.style,a.style]);else if(Hn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ie(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!or(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function Rs(e,t,s,a=null){zs(e,t,7,[s,a])}const Rx=Om();let Ix=0;function ah(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Rx,i={uid:Ix++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new cd(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Um(a,n),emitsOptions:Nm(a,n),emit:null,emitted:null,propsDefaults:st,inheritAttrs:a.inheritAttrs,ctx:st,data:st,props:st,attrs:st,slots:st,refs:st,setupState:st,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ix.bind(null,i),e.ce&&e.ce(i),i}let is=null;const Ts=()=>is||ls;let zo,ki;{const e=pr(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};zo=t("__VUE_INSTANCE_SETTERS__",s=>is=s),ki=t("__VUE_SSR_SETTERS__",s=>Un=s)}const Bi=e=>{const t=is;return zo(e),e.scope.on(),()=>{e.scope.off(),zo(t)}},Il=()=>{is&&is.scope.off(),zo(null)};function nh(e){return e.vnode.shapeFlag&4}let Un=!1;function ih(e,t=!1,s=!1){t&&ki(t);const{props:a,children:n}=e.vnode,i=nh(e);ux(e,a,i,t),hx(e,n,s||t);const l=i?Ox(e,t):void 0;return t&&ki(!1),l}function Ox(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Ec);const{setup:a}=s;if(a){Ya();const n=e.setupContext=a.length>1?rh(e):null,i=Bi(e),l=Ui(a,e,0,[e.props,n]),o=rd(l);if(Qa(),i(),(o||e.sp)&&!Ka(e)&&xd(e),o){if(l.then(Il,Il),t)return l.then(r=>{Lc(e,r,t)}).catch(r=>{qn(r,e,0)});e.asyncDep=l}else Lc(e,l,t)}else oh(e,t)}function Lc(e,t,s){Be(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:dt(t)&&(e.setupState=hd(t)),oh(e,s)}let Ho,Nc;function lh(e){Ho=e,Nc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Fy))}}const Lx=()=>!Ho;function oh(e,t,s){const a=e.type;if(!e.render){if(!t&&Ho&&!a.render){const n=a.template||Td(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=tt(tt({isCustomElement:i,delimiters:o},l),r);a.render=Ho(n,c)}}e.render=a.render||os,Nc&&Nc(e)}{const n=Bi(e);Ya();try{Yy(e)}finally{Qa(),n()}}}const Nx={get(e,t){return ms(e,"get",""),e[t]}};function rh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Nx),slots:e.slots,emit:e.emit,expose:t}}function Wl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(hd(sm(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in fl)return fl[s](e)},has(t,s){return s in t||s in fl}})):e.proxy}function Mc(e,t=!0){return Be(e)?e.displayName||e.name:e.name||t&&e.__name}function Mx(e){return Be(e)&&"__vccOpts"in e}const j=(e,t)=>Bb(e,t,Un);function Ai(e,t,s){try{Rl(-1);const a=arguments.length;return a===2?dt(t)&&!Ie(t)?en(t)?Rt(e,null,[t]):Rt(e,t):Rt(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&en(s)&&(s=[s]),Rt(e,t,s))}finally{Rl(1)}}function Dx(){}function Px(e,t,s,a){const n=s[a];if(n&&ch(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function ch(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(Qt(s[a],t[a]))return!1;return $n>0&&hs&&hs.push(e),!0}const dh="3.5.38",Fx=os,$x=Jb,Ux=di,Bx=um,zx={createComponentInstance:ah,setupComponent:ih,renderComponentRoot:wo,setCurrentRenderingInstance:Tl,isVNode:en,normalizeVNode:Os,getComponentPublicInstance:Wl,ensureValidVNode:Sd,pushWarningContext:qb,popWarningContext:Gb},Hx=zx,jx=null,Vx=null,qx=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Dc;const Bu=typeof window<"u"&&window.trustedTypes;if(Bu)try{Dc=Bu.createPolicy("vue",{createHTML:e=>e})}catch{}const uh=Dc?e=>Dc.createHTML(e):e=>e,Gx="http://www.w3.org/2000/svg",Wx="http://www.w3.org/1998/Math/MathML",$a=typeof document<"u"?document:null,zu=$a&&$a.createElement("template"),ph={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?$a.createElementNS(Gx,e):t==="mathml"?$a.createElementNS(Wx,e):s?$a.createElement(e,{is:s}):$a.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>$a.createTextNode(e),createComment:e=>$a.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>$a.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{zu.innerHTML=uh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=zu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},ln="transition",Zi="animation",Ri=Symbol("_vtc"),fh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},mh=tt({},yd,fh),Kx=e=>(e.displayName="Transition",e.props=mh,e),Jx=Kx((e,{slots:t})=>Ai(xm,hh(e),t)),Tn=(e,t=[])=>{Ie(e)?e.forEach(s=>s(...t)):e&&e(...t)},Hu=e=>e?Ie(e)?e.some(t=>t.length>1):e.length>1:!1;function hh(e){const t={};for(const T in e)T in fh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:m=`${s}-leave-to`}=e,h=Zx(n),g=h&&h[0],R=h&&h[1],{onBeforeEnter:O,onEnter:y,onEnterCancelled:v,onLeave:b,onLeaveCancelled:x,onBeforeAppear:k=O,onAppear:C=y,onAppearCancelled:A=v}=t,_=(T,F,Z,W)=>{T._enterCancelled=W,dn(T,F?d:o),dn(T,F?c:l),Z&&Z()},I=(T,F)=>{T._isLeaving=!1,dn(T,u),dn(T,m),dn(T,p),F&&F()},U=T=>(F,Z)=>{const W=T?C:y,M=()=>_(F,T,Z);Tn(W,[F,M]),ju(()=>{dn(F,T?r:i),ha(F,T?d:o),Hu(W)||Vu(F,a,g,M)})};return tt(t,{onBeforeEnter(T){Tn(O,[T]),ha(T,i),ha(T,l)},onBeforeAppear(T){Tn(k,[T]),ha(T,r),ha(T,c)},onEnter:U(!1),onAppear:U(!0),onLeave(T,F){T._isLeaving=!0;const Z=()=>I(T,F);ha(T,u),T._enterCancelled?(ha(T,p),Pc(T)):(Pc(T),ha(T,p)),ju(()=>{T._isLeaving&&(dn(T,u),ha(T,m),Hu(b)||Vu(T,a,R,Z))}),Tn(b,[T,Z])},onEnterCancelled(T){_(T,!1,void 0,!0),Tn(v,[T])},onAppearCancelled(T){_(T,!0,void 0,!0),Tn(A,[T])},onLeaveCancelled(T){I(T),Tn(x,[T])}})}function Zx(e){if(e==null)return null;if(dt(e))return[ec(e.enter),ec(e.leave)];{const t=ec(e);return[t,t]}}function ec(e){return Io(e)}function ha(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ri]||(e[Ri]=new Set)).add(t)}function dn(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[Ri];s&&(s.delete(t),s.size||(e[Ri]=void 0))}function ju(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Yx=0;function Vu(e,t,s,a){const n=e._endId=++Yx,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=vh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=m=>{m.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function vh(e,t){const s=window.getComputedStyle(e),a=h=>(s[h]||"").split(", "),n=a(`${ln}Delay`),i=a(`${ln}Duration`),l=qu(n,i),o=a(`${Zi}Delay`),r=a(`${Zi}Duration`),c=qu(o,r);let d=null,u=0,p=0;t===ln?l>0&&(d=ln,u=l,p=i.length):t===Zi?c>0&&(d=Zi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?ln:Zi:null,p=d?d===ln?i.length:r.length:0);const m=d===ln&&/\b(?:transform|all)(?:,|$)/.test(a(`${ln}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:m}}function qu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>Gu(s)+Gu(e[a])))}function Gu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Pc(e){return(e?e.ownerDocument:document).body.offsetHeight}function Qx(e,t,s){const a=e[Ri];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const jo=Symbol("_vod"),Ld=Symbol("_vsh"),gh={name:"show",beforeMount(e,{value:t},{transition:s}){e[jo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Yi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Yi(e,!0),a.enter(e)):a.leave(e,()=>{Yi(e,!1)}):Yi(e,t))},beforeUnmount(e,{value:t}){Yi(e,t)}};function Yi(e,t){e.style.display=t?e[jo]:"none",e[Ld]=!t}function Xx(){gh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const bh=Symbol("");function e0(e){const t=Ts();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Vo(i,n))},a=()=>{const n=e(t.proxy);t.ce?Vo(t.ce,n):Fc(t.subTree,n),s(n)};_d(()=>{kl(a)}),Qe(()=>{jt(a,os,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),bt(()=>n.disconnect())})}function Fc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Fc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Vo(e.el,t);else if(e.type===Xt)e.children.forEach(s=>Fc(s,t));else if(e.type===Dn){let{el:s,anchor:a}=e;for(;s&&(Vo(s,t),s!==a);)s=s.nextSibling}}function Vo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=lb(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[bh]=a}}const t0=/(?:^|;)\s*display\s*:/;function s0(e,t,s){const a=e.style,n=Ge(s);let i=!1;if(s&&!n){if(t)if(Ge(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&rl(a,o,"")}else for(const l in t)s[l]==null&&rl(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?n0(e,l,!Ge(t)&&t?t[l]:void 0,o)||rl(a,l,o):rl(a,l,"")}}else if(n){if(t!==s){const l=a[bh];l&&(s+=";"+l),a.cssText=s,i=t0.test(s)}}else t&&e.removeAttribute("style");jo in e&&(e[jo]=i?a.display:"",e[Ld]&&(a.display="none"))}const Wu=/\s*!important$/;function rl(e,t,s){if(Ie(s))s.forEach(a=>rl(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=a0(e,t);Wu.test(s)?e.setProperty(Ls(a),s.replace(Wu,""),"important"):e[a]=s}}const Ku=["Webkit","Moz","ms"],tc={};function a0(e,t){const s=tc[t];if(s)return s;let a=_t(t);if(a!=="filter"&&a in e)return tc[t]=a;a=Vn(a);for(let n=0;n<Ku.length;n++){const i=Ku[n]+a;if(i in e)return tc[t]=i}return t}function n0(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ge(a)&&s===a}const Ju="http://www.w3.org/1999/xlink";function Zu(e,t,s,a,n,i=nb(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ju,t.slice(6,t.length)):e.setAttributeNS(Ju,t,s):s==null||i&&!Pf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":gs(s)?String(s):s)}function Yu(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?uh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Pf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function ja(e,t,s,a){e.addEventListener(t,s,a)}function i0(e,t,s,a){e.removeEventListener(t,s,a)}const Qu=Symbol("_vei");function l0(e,t,s,a,n=null){const i=e[Qu]||(e[Qu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=o0(t);if(a){const c=i[t]=d0(a,n);ja(e,o,c,r)}else l&&(i0(e,o,l,r),i[t]=void 0)}}const Xu=/(?:Once|Passive|Capture)$/;function o0(e){let t;if(Xu.test(e)){t={};let a;for(;a=e.match(Xu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Ls(e.slice(2)),t]}let sc=0;const r0=Promise.resolve(),c0=()=>sc||(r0.then(()=>sc=0),sc=Date.now());function d0(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ie(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&zs(c,t,5,o)}}else zs(n,t,5,[a])};return s.value=e,s.attached=c0(),s}const ep=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,yh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?Qx(e,a,l):t==="style"?s0(e,s,a):Hn(t)?or(t)||l0(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):u0(e,t,a,l))?(Yu(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Zu(e,t,a,l,i,t!=="value")):e._isVueCE&&(p0(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ge(a)))?Yu(e,_t(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),Zu(e,t,a,l))};function u0(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&ep(t)&&Be(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return ep(t)&&Ge(s)?!1:t in e}function p0(e,t){const s=e._def.props;if(!s)return!1;const a=_t(t);return Array.isArray(s)?s.some(n=>_t(n)===a):Object.keys(s).some(n=>_t(n)===a)}const tp={};function xh(e,t,s){let a=ql(e,t);rr(a)&&(a=tt({},a,t));class n extends Tr{constructor(l){super(a,l,s)}}return n.def=a,n}const f0=((e,t)=>xh(e,t,Nh)),m0=typeof HTMLElement<"u"?HTMLElement:class{};class Tr extends m0{constructor(t,s={},a=Wo){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==Wo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(tt({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Tr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Pt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ie(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Io(this._props[r])),(o||(o=Object.create(null)))[_t(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)ft(this,a)||Object.defineProperty(this,a,{get:()=>_a(s[a])})}_resolveProps(t){const{props:s}=t,a=Ie(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(_t))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):tp;const n=_t(t);s&&this._numberProps&&this._numberProps[n]&&(a=Io(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===tp?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Ls(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Ls(t),s+""):s||this.removeAttribute(Ls(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Lh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=Rt(this._def,tt(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,rr(l[0])?tt({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),Ls(i)!==i&&n(Ls(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function _h(e){const t=Ts(),s=t&&t.ce;return s||null}function h0(){const e=_h();return e&&e.shadowRoot}function v0(e="$style"){{const t=Ts();if(!t)return st;const s=t.type.__cssModules;if(!s)return st;const a=s[e];return a||st}}const wh=new WeakMap,kh=new WeakMap,qo=Symbol("_moveCb"),sp=Symbol("_enterCb"),g0=e=>(delete e.props.mode,e),b0=g0({name:"TransitionGroup",props:tt({},mh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Ts(),a=bd();let n,i;return _r(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!k0(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(x0),n.forEach(_0);const o=n.filter(w0);Pc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;ha(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[qo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[qo]=null,dn(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=it(e),o=hh(l);let r=l.tag||Xt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Ld]&&(n.push(d),Xa(d,Ei(d,o,a,s)),wh.set(d,Sh(d.el)))}i=t.default?yr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Xa(d,Ei(d,o,a,s))}return Rt(r,null,i)}}}),y0=b0;function x0(e){const t=e.el;t[qo]&&t[qo](),t[sp]&&t[sp]()}function _0(e){kh.set(e,Sh(e.el))}function w0(e){const t=wh.get(e),s=kh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Sh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function k0(e,t,s){const a=e.cloneNode(),n=e[Ri];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=vh(a);return i.removeChild(a),l}const bn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ie(t)?s=>yi(t,s):t};function S0(e){e.target.composing=!0}function ap(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ea=Symbol("_assign");function np(e,t,s){return t&&(e=e.trim()),s&&(e=ur(e)),e}const Go={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[ea]=bn(n);const i=a||n.props&&n.props.type==="number";ja(e,t?"change":"input",l=>{l.target.composing||e[ea](np(e.value,s,i))}),(s||i)&&ja(e,"change",()=>{e.value=np(e.value,s,i)}),t||(ja(e,"compositionstart",S0),ja(e,"compositionend",ap),ja(e,"change",ap))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[ea]=bn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?ur(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},Nd={deep:!0,created(e,t,s){e[ea]=bn(s),ja(e,"change",()=>{const a=e._modelValue,n=Ii(e),i=e.checked,l=e[ea];if(Ie(a)){const o=fr(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(jn(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Ch(e,i))})},mounted:ip,beforeUpdate(e,t,s){e[ea]=bn(s),ip(e,t,s)}};function ip(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ie(t))n=fr(t,a.props.value)>-1;else if(jn(t))n=t.has(a.props.value);else{if(t===s)return;n=Za(t,Ch(e,!0))}e.checked!==n&&(e.checked=n)}const Md={created(e,{value:t},s){e.checked=Za(t,s.props.value),e[ea]=bn(s),ja(e,"change",()=>{e[ea](Ii(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[ea]=bn(a),t!==s&&(e.checked=Za(t,a.props.value))}},Th={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=jn(t);ja(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?ur(Ii(l)):Ii(l));e[ea](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Pt(()=>{e._assigning=!1})}),e[ea]=bn(a)},mounted(e,{value:t}){lp(e,t)},beforeUpdate(e,t,s){e[ea]=bn(s)},updated(e,{value:t}){e._assigning||lp(e,t)}};function lp(e,t){const s=e.multiple,a=Ie(t);if(!(s&&!a&&!jn(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=Ii(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=fr(t,o)>-1}else l.selected=t.has(o);else if(Za(Ii(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ii(e){return"_value"in e?e._value:e.value}function Ch(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Eh={created(e,t,s){uo(e,t,s,null,"created")},mounted(e,t,s){uo(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){uo(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){uo(e,t,s,a,"updated")}};function Ah(e,t){switch(e){case"SELECT":return Th;case"TEXTAREA":return Go;default:switch(t){case"checkbox":return Nd;case"radio":return Md;default:return Go}}}function uo(e,t,s,a,n){const l=Ah(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function T0(){Go.getSSRProps=({value:e})=>({value:e}),Md.getSSRProps=({value:e},t)=>{if(t.props&&Za(t.props.value,e))return{checked:!0}},Nd.getSSRProps=({value:e},t)=>{if(Ie(e)){if(t.props&&fr(e,t.props.value)>-1)return{checked:!0}}else if(jn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Eh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Ah(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const C0=["ctrl","shift","alt","meta"],E0={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>C0.some(s=>e[`${s}Key`]&&!t.includes(s))},A0=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=E0[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},R0={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},I0=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=Ls(n.key);if(t.some(l=>l===i||R0[l]===i))return e(n)}))},Rh=tt({patchProp:yh},ph);let hl,op=!1;function Ih(){return hl||(hl=jm(Rh))}function Oh(){return hl=op?hl:Vm(Rh),op=!0,hl}const Lh=((...e)=>{Ih().render(...e)}),O0=((...e)=>{Oh().hydrate(...e)}),Wo=((...e)=>{const t=Ih().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Dh(a);if(!n)return;const i=t._component;!Be(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,Mh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),Nh=((...e)=>{const t=Oh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Dh(a);if(n)return s(n,!0,Mh(n))},t});function Mh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Dh(e){return Ge(e)?document.querySelector(e):e}let rp=!1;const L0=()=>{rp||(rp=!0,T0(),Xx())},N0=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:xm,BaseTransitionPropsValidators:yd,Comment:Ft,DeprecationTypes:qx,EffectScope:cd,ErrorCodes:Kb,ErrorTypeStrings:$x,Fragment:Xt,KeepAlive:Ey,ReactiveEffect:xl,Static:Dn,Suspense:yx,Teleport:cy,Text:vn,TrackOpTypes:zb,Transition:Jx,TransitionGroup:y0,TriggerOpTypes:Hb,VueElement:Tr,assertNumber:Wb,callWithAsyncErrorHandling:zs,callWithErrorHandling:Ui,camelize:_t,capitalize:Vn,cloneVNode:ka,compatUtils:Vx,computed:j,createApp:Wo,createBlock:Bo,createCommentVNode:th,createElementBlock:Tx,createElementVNode:Rd,createHydrationRenderer:Vm,createPropsRestProxy:Jy,createRenderer:jm,createSSRApp:Nh,createSlots:My,createStaticVNode:Ax,createTextVNode:Id,createVNode:Rt,customRef:nm,defineAsyncComponent:Ty,defineComponent:ql,defineCustomElement:xh,defineEmits:Uy,defineExpose:By,defineModel:jy,defineOptions:zy,defineProps:$y,defineSSRCustomElement:f0,defineSlots:Hy,devtools:Ux,effect:db,effectScope:ob,getCurrentInstance:Ts,getCurrentScope:Bf,getCurrentWatcher:jb,getTransitionRawChildren:yr,guardReactiveProps:eh,h:Ai,handleError:qn,hasInjectionContext:sy,hydrate:O0,hydrateOnIdle:yy,hydrateOnInteraction:ky,hydrateOnMediaQuery:wy,hydrateOnVisible:_y,initCustomFormatter:Dx,initDirectivesForSSR:L0,inject:Xs,isMemoSame:ch,isProxy:jl,isReactive:Wa,isReadonly:wa,isRef:Ht,isRuntimeOnly:Lx,isShallow:Ms,isVNode:en,markRaw:sm,mergeDefaults:Wy,mergeModels:Ky,mergeProps:sh,nextTick:Pt,nodeOps:ph,normalizeClass:Hl,normalizeProps:Kg,normalizeStyle:zl,onActivated:rs,onBeforeMount:km,onBeforeUnmount:wr,onBeforeUpdate:_d,onDeactivated:Jt,onErrorCaptured:Em,onMounted:Qe,onRenderTracked:Cm,onRenderTriggered:Tm,onScopeDispose:rb,onServerPrefetch:Sm,onUnmounted:bt,onUpdated:_r,onWatcherCleanup:lm,openBlock:Al,patchProp:yh,popScopeId:Xb,provide:pl,proxyRefs:hd,pushScopeId:Qb,queuePostFlushCb:kl,reactive:yn,readonly:Lo,ref:f,registerRuntimeCompiler:lh,render:Lh,renderList:Ny,renderSlot:Dy,resolveComponent:Iy,resolveDirective:Ly,resolveDynamicComponent:Oy,resolveFilter:jx,resolveTransitionHooks:Ei,setBlockTracking:Rl,setDevtoolsHook:Bx,setTransitionHooks:Xa,shallowReactive:fd,shallowReadonly:Rb,shallowRef:md,ssrContextKey:pm,ssrUtils:Hx,stop:ub,toDisplayString:$f,toHandlerKey:bi,toHandlers:Py,toRaw:it,toRef:$b,toRefs:Db,toValue:Lb,transformVNodeArgs:Cx,triggerRef:Ob,unref:_a,useAttrs:Gy,useCssModule:v0,useCssVars:e0,useHost:_h,useId:uy,useModel:nx,useSSRContext:fm,useShadowRoot:h0,useSlots:qy,useTemplateRef:py,useTransitionState:bd,vModelCheckbox:Nd,vModelDynamic:Eh,vModelRadio:Md,vModelSelect:Th,vModelText:Go,vShow:gh,version:dh,warn:Fx,watch:jt,watchEffect:ay,watchPostEffect:ny,watchSyncEffect:mm,withAsyncContext:Zy,withCtx:gd,withDefaults:Vy,withDirectives:ty,withKeys:I0,withMemo:Px,withModifiers:A0,withScopeId:ey},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ol=Symbol(""),vl=Symbol(""),Dd=Symbol(""),Ko=Symbol(""),Ph=Symbol(""),Bn=Symbol(""),Fh=Symbol(""),$h=Symbol(""),Pd=Symbol(""),Fd=Symbol(""),Kl=Symbol(""),$d=Symbol(""),Uh=Symbol(""),Ud=Symbol(""),Bd=Symbol(""),zd=Symbol(""),Hd=Symbol(""),jd=Symbol(""),Vd=Symbol(""),Bh=Symbol(""),zh=Symbol(""),Cr=Symbol(""),Jo=Symbol(""),qd=Symbol(""),Gd=Symbol(""),Ll=Symbol(""),Jl=Symbol(""),Wd=Symbol(""),$c=Symbol(""),M0=Symbol(""),Uc=Symbol(""),Zo=Symbol(""),D0=Symbol(""),P0=Symbol(""),Kd=Symbol(""),F0=Symbol(""),$0=Symbol(""),Jd=Symbol(""),Hh=Symbol(""),Oi={[Ol]:"Fragment",[vl]:"Teleport",[Dd]:"Suspense",[Ko]:"KeepAlive",[Ph]:"BaseTransition",[Bn]:"openBlock",[Fh]:"createBlock",[$h]:"createElementBlock",[Pd]:"createVNode",[Fd]:"createElementVNode",[Kl]:"createCommentVNode",[$d]:"createTextVNode",[Uh]:"createStaticVNode",[Ud]:"resolveComponent",[Bd]:"resolveDynamicComponent",[zd]:"resolveDirective",[Hd]:"resolveFilter",[jd]:"withDirectives",[Vd]:"renderList",[Bh]:"renderSlot",[zh]:"createSlots",[Cr]:"toDisplayString",[Jo]:"mergeProps",[qd]:"normalizeClass",[Gd]:"normalizeStyle",[Ll]:"normalizeProps",[Jl]:"guardReactiveProps",[Wd]:"toHandlers",[$c]:"camelize",[M0]:"capitalize",[Uc]:"toHandlerKey",[Zo]:"setBlockTracking",[D0]:"pushScopeId",[P0]:"popScopeId",[Kd]:"withCtx",[F0]:"unref",[$0]:"isRef",[Jd]:"withMemo",[Hh]:"isMemoSame"};function U0(e){Object.getOwnPropertySymbols(e).forEach(t=>{Oi[t]=e[t]})}const js={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function B0(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:js}}function Nl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=js){return e&&(o?(e.helper(Bn),e.helper(Mi(e.inSSR,c))):e.helper(Ni(e.inSSR,c)),l&&e.helper(jd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function Pn(e,t=js){return{type:17,loc:t,elements:e}}function Qs(e,t=js){return{type:15,loc:t,properties:e}}function zt(e,t){return{type:16,loc:js,key:Ge(e)?Ze(e,!0):e,value:t}}function Ze(e,t=!1,s=js,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function oa(e,t=js){return{type:8,loc:t,children:e}}function Kt(e,t=[],s=js){return{type:14,loc:s,callee:e,arguments:t}}function Li(e,t=void 0,s=!1,a=!1,n=js){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function Bc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:js}}function z0(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:js}}function H0(e){return{type:21,body:e,loc:js}}function Ni(e,t){return e||t?Pd:Fd}function Mi(e,t){return e||t?Fh:$h}function Zd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(Ni(a,e.isComponent)),t(Bn),t(Mi(a,e.isComponent)))}const cp=new Uint8Array([123,123]),dp=new Uint8Array([125,125]);function up(e){return e>=97&&e<=122||e>=65&&e<=90}function Us(e){return e===32||e===10||e===9||e===12||e===13}function on(e){return e===47||e===62||Us(e)}function Yo(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const us={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class j0{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=cp,this.delimiterClose=dp,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=cp,this.delimiterClose=dp}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?on(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Us(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===us.TitleEnd||this.currentSequence===us.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===us.Cdata[this.sequenceIndex]?++this.sequenceIndex===us.Cdata.length&&(this.state=28,this.currentSequence=us.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===us.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):up(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){on(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(on(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Yo("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Us(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=up(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Us(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Us(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Us(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||on(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||on(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||on(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||on(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||on(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Us(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Us(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Us(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=us.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===us.ScriptEnd[3]?this.startSpecial(us.ScriptEnd,4):t===us.StyleEnd[3]?this.startSpecial(us.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===us.TitleEnd[3]?this.startSpecial(us.TitleEnd,4):t===us.TextareaEnd[3]?this.startSpecial(us.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===us.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function pp(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Fn(e,t){const s=pp("MODE",t),a=pp(e,t);return s===3?a===!0:a!==!1}function Ml(e,t,s,...a){return Fn(e,t)}function Yd(e){throw e}function jh(e){}function At(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Ns=e=>e.type===4&&e.isStatic;function Vh(e){switch(e){case"Teleport":case"teleport":return vl;case"Suspense":case"suspense":return Dd;case"KeepAlive":case"keep-alive":return Ko;case"BaseTransition":case"base-transition":return Ph}}const V0=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Qd=e=>!V0.test(e),qh=/[A-Za-z_$\xA0-\uFFFF]/,q0=/[\.\?\w$\xA0-\uFFFF]/,G0=/\s+[.[]\s*|\s*[.[]\s+/g,Gh=e=>e.type===4?e.content:e.loc.source,W0=e=>{const t=Gh(e).trim().replace(G0,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?qh:q0).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},Wh=W0,K0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,J0=e=>K0.test(Gh(e)),Z0=J0;function Ys(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Ge(t)?n.name===t:t.test(n.name)))return n}}function Er(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&In(i.arg,t))return i}}function In(e,t){return!!(e&&Ns(e)&&e.content===t)}function Y0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function ac(e){return e.type===5||e.type===2}function fp(e){return e.type===7&&e.name==="pre"}function Q0(e){return e.type===7&&e.name==="slot"}function Qo(e){return e.type===1&&e.tagType===3}function Xo(e){return e.type===1&&e.tagType===2}const X0=new Set([Ll,Jl]);function Kh(e,t=[]){if(e&&!Ge(e)&&e.type===14){const s=e.callee;if(!Ge(s)&&X0.has(s))return Kh(e.arguments[0],t.concat(e))}return[e,t]}function er(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Ge(n)&&n.type===14){const o=Kh(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Ge(n))a=Qs([t]);else if(n.type===14){const o=n.arguments[0];!Ge(o)&&o.type===15?mp(t,o)||o.properties.unshift(t):n.callee===Wd?a=Kt(s.helper(Jo),[Qs([t]),n]):n.arguments.unshift(Qs([t])),!a&&(a=n)}else n.type===15?(mp(t,n)||n.properties.unshift(t),a=n):(a=Kt(s.helper(Jo),[Qs([t]),n]),l&&l.callee===Jl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function mp(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function Dl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function e_(e){return e.type===14&&e.callee===Jd?e.arguments[1].returns:e}const t_=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Jh(e){for(let t=0;t<e.length;t++)if(!Us(e.charCodeAt(t)))return!1;return!0}function Xd(e){return e.type===2&&Jh(e.content)||e.type===12&&Xd(e.content)}function Zh(e){return e.type===3||Xd(e)}const Yh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:fi,isPreTag:fi,isIgnoreNewlineTag:fi,isCustomElement:fi,onError:Yd,onWarn:jh,comments:!1,prefixIdentifiers:!1};let ct=Yh,Pl=null,Ja="",fs=null,at=null,As="",Fa=-1,En=-1,eu=0,fn=!1,zc=null;const Et=[],Mt=new j0(Et,{onerr:Ma,ontext(e,t){po(ns(e,t),e,t)},ontextentity(e,t,s){po(e,t,s)},oninterpolation(e,t){if(fn)return po(ns(e,t),e,t);let s=e+Mt.delimiterOpen.length,a=t-Mt.delimiterClose.length;for(;Us(Ja.charCodeAt(s));)s++;for(;Us(Ja.charCodeAt(a-1));)a--;let n=ns(s,a);n.includes("&")&&(n=ct.decodeEntities(n,!1)),Hc({type:5,content:To(n,!1,Dt(s,a)),loc:Dt(e,t)})},onopentagname(e,t){const s=ns(e,t);fs={type:1,tag:s,ns:ct.getNamespace(s,Et[0],ct.ns),tagType:0,props:[],children:[],loc:Dt(e-1,t),codegenNode:void 0}},onopentagend(e){vp(e)},onclosetag(e,t){const s=ns(e,t);if(!ct.isVoidTag(s)){let a=!1;for(let n=0;n<Et.length;n++)if(Et[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&Ma(24,Et[0].loc.start.offset);for(let l=0;l<=n;l++){const o=Et.shift();So(o,t,l<n)}break}a||Ma(23,Qh(e,60))}},onselfclosingtag(e){const t=fs.tag;fs.isSelfClosing=!0,vp(e),Et[0]&&Et[0].tag===t&&So(Et.shift(),e)},onattribname(e,t){at={type:6,name:ns(e,t),nameLoc:Dt(e,t),value:void 0,loc:Dt(e)}},ondirname(e,t){const s=ns(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!fn&&a===""&&Ma(26,e),fn||a==="")at={type:6,name:s,nameLoc:Dt(e,t),value:void 0,loc:Dt(e)};else if(at={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ze("prop")]:[],loc:Dt(e)},a==="pre"){fn=Mt.inVPre=!0,zc=fs;const n=fs.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=u_(n[i]))}},ondirarg(e,t){if(e===t)return;const s=ns(e,t);if(fn&&!fp(at))at.name+=s,On(at.nameLoc,t);else{const a=s[0]!=="[";at.arg=To(a?s:s.slice(1,-1),a,Dt(e,t),a?3:0)}},ondirmodifier(e,t){const s=ns(e,t);if(fn&&!fp(at))at.name+="."+s,On(at.nameLoc,t);else if(at.name==="slot"){const a=at.arg;a&&(a.content+="."+s,On(a.loc,t))}else{const a=Ze(s,!0,Dt(e,t));at.modifiers.push(a)}},onattribdata(e,t){As+=ns(e,t),Fa<0&&(Fa=e),En=t},onattribentity(e,t,s){As+=e,Fa<0&&(Fa=t),En=s},onattribnameend(e){const t=at.loc.start.offset,s=ns(t,e);at.type===7&&(at.rawName=s),fs.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&Ma(2,t)},onattribend(e,t){if(fs&&at){if(On(at.loc,t),e!==0)if(As.includes("&")&&(As=ct.decodeEntities(As,!0)),at.type===6)at.name==="class"&&(As=ev(As).trim()),e===1&&!As&&Ma(13,t),at.value={type:2,content:As,loc:e===1?Dt(Fa,En):Dt(Fa-1,En+1)},Mt.inSFCRoot&&fs.tag==="template"&&at.name==="lang"&&As&&As!=="html"&&Mt.enterRCDATA(Yo("</template"),0);else{let s=0;at.exp=To(As,!1,Dt(Fa,En),0,s),at.name==="for"&&(at.forParseResult=a_(at.exp));let a=-1;at.name==="bind"&&(a=at.modifiers.findIndex(n=>n.content==="sync"))>-1&&Ml("COMPILER_V_BIND_SYNC",ct,at.loc,at.arg.loc.source)&&(at.name="model",at.modifiers.splice(a,1))}(at.type!==7||at.name!=="pre")&&fs.props.push(at)}As="",Fa=En=-1},oncomment(e,t){ct.comments&&Hc({type:3,content:ns(e,t),loc:Dt(e-4,t+3)})},onend(){const e=Ja.length;for(let t=0;t<Et.length;t++)So(Et[t],e-1),Ma(24,Et[t].loc.start.offset)},oncdata(e,t){(Et[0]?Et[0].ns:ct.ns)!==0?po(ns(e,t),e,t):Ma(1,e-9)},onprocessinginstruction(e){(Et[0]?Et[0].ns:ct.ns)===0&&Ma(21,e-1)}}),hp=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,s_=/^\(|\)$/g;function a_(e){const t=e.loc,s=e.content,a=s.match(t_);if(!a)return;const[,n,i]=a,l=(u,p,m=!1)=>{const h=t.start.offset+p,g=h+u.length;return To(u,!1,Dt(h,g),0,m?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(s_,"").trim();const c=n.indexOf(r),d=r.match(hp);if(d){r=r.replace(hp,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const m=d[2].trim();m&&(o.index=l(m,s.indexOf(m,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function ns(e,t){return Ja.slice(e,t)}function vp(e){Mt.inSFCRoot&&(fs.innerLoc=Dt(e+1,e+1)),Hc(fs);const{tag:t,ns:s}=fs;s===0&&ct.isPreTag(t)&&eu++,ct.isVoidTag(t)?So(fs,e):(Et.unshift(fs),(s===1||s===2)&&(Mt.inXML=!0)),fs=null}function po(e,t,s){{const i=Et[0]&&Et[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=ct.decodeEntities(e,!1))}const a=Et[0]||Pl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,On(n.loc,s)):a.children.push({type:2,content:e,loc:Dt(t,s)})}function So(e,t,s=!1){s?On(e.loc,Qh(t,60)):On(e.loc,n_(t,62)+1),Mt.inSFCRoot&&(e.children.length?e.innerLoc.end=tt({},e.children[e.children.length-1].loc.end):e.innerLoc.end=tt({},e.innerLoc.start),e.innerLoc.source=ns(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(fn||(a==="slot"?e.tagType=2:gp(e)?e.tagType=3:l_(e)&&(e.tagType=1)),Mt.inRCDATA||(e.children=Xh(i)),n===0&&ct.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&ct.isPreTag(a)&&eu--,zc===e&&(fn=Mt.inVPre=!1,zc=null),Mt.inXML&&(Et[0]?Et[0].ns:ct.ns)===0&&(Mt.inXML=!1);{const l=e.props;if(!Mt.inSFCRoot&&Fn("COMPILER_NATIVE_TEMPLATE",ct)&&e.tag==="template"&&!gp(e)){const r=Et[0]||Pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&Ml("COMPILER_INLINE_TEMPLATE",ct,o.loc)&&e.children.length&&(o.value={type:2,content:ns(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function n_(e,t){let s=e;for(;Ja.charCodeAt(s)!==t&&s<Ja.length-1;)s++;return s}function Qh(e,t){let s=e;for(;Ja.charCodeAt(s)!==t&&s>=0;)s--;return s}const i_=new Set(["if","else","else-if","for","slot"]);function gp({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&i_.has(t[s].name))return!0}return!1}function l_({tag:e,props:t}){if(ct.isCustomElement(e))return!1;if(e==="component"||o_(e.charCodeAt(0))||Vh(e)||ct.isBuiltInComponent&&ct.isBuiltInComponent(e)||ct.isNativeTag&&!ct.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(Ml("COMPILER_IS_ON_ELEMENT",ct,a.loc))return!0}}else if(a.name==="bind"&&In(a.arg,"is")&&Ml("COMPILER_IS_ON_ELEMENT",ct,a.loc))return!0}return!1}function o_(e){return e>64&&e<91}const r_=/\r\n/g;function Xh(e){const t=ct.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(eu)n.content=n.content.replace(r_,`
`);else if(Jh(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&c_(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=ev(n.content))}return s?e.filter(Boolean):e}function c_(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function ev(e){let t="",s=!1;for(let a=0;a<e.length;a++)Us(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function Hc(e){(Et[0]||Pl).children.push(e)}function Dt(e,t){return{start:Mt.getPos(e),end:t==null?t:Mt.getPos(t),source:t==null?t:ns(e,t)}}function d_(e){return Dt(e.start.offset,e.end.offset)}function On(e,t){e.end=Mt.getPos(t),e.source=ns(e.start.offset,t)}function u_(e){const t={type:6,name:e.rawName,nameLoc:Dt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function To(e,t=!1,s,a=0,n=0){return Ze(e,t,s,a)}function Ma(e,t,s){ct.onError(At(e,Dt(t,t)))}function p_(){Mt.reset(),fs=null,at=null,As="",Fa=-1,En=-1,Et.length=0}function f_(e,t){if(p_(),Ja=e,ct=tt({},Yh),t){let n;for(n in t)t[n]!=null&&(ct[n]=t[n])}Mt.mode=ct.parseMode==="html"?1:ct.parseMode==="sfc"?2:0,Mt.inXML=ct.ns===1||ct.ns===2;const s=t&&t.delimiters;s&&(Mt.delimiterOpen=Yo(s[0]),Mt.delimiterClose=Yo(s[1]));const a=Pl=B0([],e);return Mt.parse(Ja),a.loc=Dt(0,e.length),a.children=Xh(a.children),Pl=null,a}function m_(e,t){Co(e,void 0,t,!!tv(e))}function tv(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Xo(t[0])?t[0]:null}function Co(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Bs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const m=u.codegenNode;if(m.type===13){const h=m.patchFlag;if((h===void 0||h===512||h===1)&&av(u,s)>=2){const g=nv(u);g&&(m.props=s.hoist(g))}m.dynamicProps&&(m.dynamicProps=s.hoist(m.dynamicProps))}}}else if(u.type===12&&(a?0:Bs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Co(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Co(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Co(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ie(e.codegenNode.children))e.codegenNode.children=r(Pn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ie(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(Pn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ie(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Ys(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(Pn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ie(d.children)&&d.children.type===15){const p=d.children.properties.find(m=>m.key===u||m.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Bs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=av(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Bs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Bs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Bn),t.removeHelper(Mi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(Ni(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Bs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ge(o)||gs(o))continue;const r=Bs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const h_=new Set([qd,Gd,Ll,Jl]);function sv(e,t){if(e.type===14&&!Ge(e.callee)&&h_.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Bs(s,t);if(s.type===14)return sv(s,t)}return 0}function av(e,t){let s=3;const a=nv(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Bs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Bs(o,t):o.type===14?c=sv(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function nv(e){const t=e.codegenNode;if(t.type===13)return t.props}function v_(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=os,isCustomElement:d=os,expressionPlugins:u=[],scopeId:p=null,slotted:m=!0,ssr:h=!1,inSSR:g=!1,ssrCssVars:R="",bindingMetadata:O=st,inline:y=!1,isTS:v=!1,onError:b=Yd,onWarn:x=jh,compatConfig:k}){const C=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),A={filename:t,selfName:C&&Vn(_t(C[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:m,ssr:h,inSSR:g,ssrCssVars:R,bindingMetadata:O,inline:y,isTS:v,onError:b,onWarn:x,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(_){const I=A.helpers.get(_)||0;return A.helpers.set(_,I+1),_},removeHelper(_){const I=A.helpers.get(_);if(I){const U=I-1;U?A.helpers.set(_,U):A.helpers.delete(_)}},helperString(_){return`_${Oi[A.helper(_)]}`},replaceNode(_){A.parent.children[A.childIndex]=A.currentNode=_},removeNode(_){const I=A.parent.children,U=_?I.indexOf(_):A.currentNode?A.childIndex:-1;!_||_===A.currentNode?(A.currentNode=null,A.onNodeRemoved()):A.childIndex>U&&(A.childIndex--,A.onNodeRemoved()),A.parent.children.splice(U,1)},onNodeRemoved:os,addIdentifiers(_){},removeIdentifiers(_){},hoist(_){Ge(_)&&(_=Ze(_)),A.hoists.push(_);const I=Ze(`_hoisted_${A.hoists.length}`,!1,_.loc,2);return I.hoisted=_,I},cache(_,I=!1,U=!1){const T=z0(A.cached.length,_,I,U);return A.cached.push(T),T}};return A.filters=new Set,A}function g_(e,t){const s=v_(e,t);Ar(e,s),t.hoistStatic&&m_(e,s),t.ssr||b_(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function b_(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=tv(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&Zd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=Nl(t,s(Ol),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function y_(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Ge(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,Ar(n,t))}}function Ar(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ie(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Kl);break;case 5:t.ssr||t.helper(Cr);break;case 9:for(let i=0;i<e.branches.length;i++)Ar(e.branches[i],t);break;case 10:case 11:case 1:case 0:y_(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function iv(e,t){const s=Ge(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(Q0))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const Rr="/*@__PURE__*/",lv=e=>`${Oi[e]}: _${Oi[e]}`;function x_(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const m={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Oi[g]}`},push(g,R=-2,O){m.code+=g},indent(){h(++m.indentLevel)},deindent(g=!1){g?--m.indentLevel:h(--m.indentLevel)},newline(){h(m.indentLevel)}};function h(g){m.push(`
`+"  ".repeat(g),0)}return m}function __(e,t={}){const s=x_(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,m=!i&&a!=="module";w_(e,s);const g=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${g}(${O}) {`),l(),m&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(lv).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(nc(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(nc(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),nc(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?vs(e.codegenNode,s):n("null"),m&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function w_(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Pd,Fd,Kl,$d,Uh].filter(p=>d.includes(p)).map(lv).join(", ");n(`const { ${u} } = _Vue
`,-1)}k_(e.hoists,t),i(),n("return ")}function nc(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?Hd:t==="component"?Ud:zd);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${Dl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function k_(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),vs(i,t),a())}t.pure=!1}function tu(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Zl(e,t,s),s&&t.deindent(),t.push("]")}function Zl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ge(o)?n(o,-3):Ie(o)?tu(o,t):vs(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function vs(e,t){if(Ge(e)){t.push(e,-3);return}if(gs(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:vs(e.codegenNode,t);break;case 2:S_(e,t);break;case 4:ov(e,t);break;case 5:T_(e,t);break;case 12:vs(e.codegenNode,t);break;case 8:rv(e,t);break;case 3:E_(e,t);break;case 13:A_(e,t);break;case 14:I_(e,t);break;case 15:O_(e,t);break;case 17:L_(e,t);break;case 18:N_(e,t);break;case 19:M_(e,t);break;case 20:D_(e,t);break;case 21:Zl(e.body,t,!0,!1);break}}function S_(e,t){t.push(JSON.stringify(e.content),-3,e)}function ov(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function T_(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Rr),s(`${a(Cr)}(`),vs(e.content,t),s(")")}function rv(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Ge(a)?t.push(a,-3):vs(a,t)}}function C_(e,t){const{push:s}=t;if(e.type===8)s("["),rv(e,t),s("]");else if(e.isStatic){const a=Qd(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function E_(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Rr),s(`${a(Kl)}(${JSON.stringify(e.content)})`,-3,e)}function A_(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:m}=e;let h;r&&(h=String(r)),d&&s(a(jd)+"("),u&&s(`(${a(Bn)}(${p?"true":""}), `),n&&s(Rr);const g=u?Mi(t.inSSR,m):Ni(t.inSSR,m);s(a(g)+"(",-2,e),Zl(R_([i,l,o,h,c]),t),s(")"),u&&s(")"),d&&(s(", "),vs(d,t),s(")"))}function R_(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function I_(e,t){const{push:s,helper:a,pure:n}=t,i=Ge(e.callee)?e.callee:a(e.callee);n&&s(Rr),s(i+"(",-2,e),Zl(e.arguments,t),s(")")}function O_(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];C_(c,t),s(": "),vs(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function L_(e,t){tu(e.elements,t)}function N_(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${Oi[Kd]}(`),s("(",-2,e),Ie(i)?Zl(i,t):i&&vs(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ie(l)?tu(l,t):vs(l,t)):o&&vs(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function M_(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Qd(s.content);u&&l("("),ov(s,t),u&&l(")")}else l("("),vs(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),vs(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,vs(n,t),d||t.indentLevel--,i&&r(!0)}function D_(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(Zo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),vs(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(Zo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const P_=iv(/^(?:if|else|else-if)$/,(e,t,s)=>F_(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=yp(n,r,s);else{const c=$_(a.codegenNode);c.alternate=yp(n,r+a.branches.length-1,s)}}}));function F_(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(At(28,t.loc)),t.exp=Ze("true",!1,n)}if(t.name==="if"){const n=bp(e,t),i={type:9,loc:d_(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&Zh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(At(30,e.loc)),s.removeNode();const o=bp(e,t);l.branches.push(o);const r=a&&a(l,o,!1);Ar(o,s),r&&r(),s.currentNode=null}else s.onError(At(30,e.loc));break}}}function bp(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Ys(e,"for")?e.children:[e],userKey:Er(e,"key"),isTemplateIf:s}}function yp(e,t,s){return e.condition?Bc(e.condition,xp(e,t,s),Kt(s.helper(Kl),['""',"true"])):xp(e,t,s)}function xp(e,t,s){const{helper:a}=s,n=zt("key",Ze(`${t}`,!1,js,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return er(r,n,s),r}else return Nl(s,a(Ol),Qs([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=e_(r);return c.type===13&&Zd(c,s),er(c,n,s),r}}function $_(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const U_=iv("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return B_(e,t,s,i=>{const l=Kt(a(Vd),[i.source]),o=Qo(e),r=Ys(e,"memo"),c=Er(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ze(c.value.content,!0):void 0:c.exp);const u=d?zt("key",d):null,p=i.source.type===4&&i.source.constType>0,m=p?64:c?128:256;return i.codegenNode=Nl(s,a(Ol),void 0,l,m,void 0,void 0,!0,!p,!1,e.loc),()=>{let h;const{children:g}=i,R=g.length!==1||g[0].type!==1,O=Xo(e)?e:o&&e.children.length===1&&Xo(e.children[0])?e.children[0]:null;if(O?(h=O.codegenNode,o&&u&&er(h,u,s)):R?h=Nl(s,a(Ol),u?Qs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(h=g[0].codegenNode,o&&u&&er(h,u,s),h.isBlock!==!p&&(h.isBlock?(n(Bn),n(Mi(s.inSSR,h.isComponent))):n(Ni(s.inSSR,h.isComponent))),h.isBlock=!p,h.isBlock?(a(Bn),a(Mi(s.inSSR,h.isComponent))):a(Ni(s.inSSR,h.isComponent))),r){const y=Li(jc(i.parseResult,[Ze("_cached")]));y.body=H0([oa(["const _memo = (",r.exp,")"]),oa(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Hh)}(_cached, _memo)) return _cached`]),oa(["const _item = ",h]),Ze("_item.memo = _memo"),Ze("return _item")]),l.arguments.push(y,Ze("_cache"),Ze(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Li(jc(i.parseResult),h,!0))}})});function B_(e,t,s,a){if(!t.exp){s.onError(At(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(At(32,t.loc));return}cv(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Qo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const m=a&&a(p);return()=>{o.vFor--,m&&m()}}function cv(e,t){e.finalized||(e.finalized=!0)}function jc({value:e,key:t,index:s},a=[]){return z_([e,t,s,...a])}function z_(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ze("_".repeat(a+1),!1))}const _p=Ze("undefined",!1),H_=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Ys(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},j_=(e,t,s,a)=>Li(e,s,!1,!0,s.length?s[0].loc:a);function V_(e,t,s=j_){t.helper(Kd);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Ys(e,"slot",!0);if(r){const{arg:R,exp:O}=r;R&&!Ns(R)&&(o=!0),i.push(zt(R||Ze("default",!0),s(O,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let m=0;for(let R=0;R<a.length;R++){const O=a[R];let y;if(!Qo(O)||!(y=Ys(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(r){t.onError(At(37,y.loc));break}c=!0;const{children:v,loc:b}=O,{arg:x=Ze("default",!0),exp:k,loc:C}=y;let A;Ns(x)?A=x?x.content:"default":o=!0;const _=Ys(O,"for"),I=s(k,_,v,b);let U,T;if(U=Ys(O,"if"))o=!0,l.push(Bc(U.exp,fo(x,I,m++),_p));else if(T=Ys(O,/^else(?:-if)?$/,!0)){let F=R,Z;for(;F--&&(Z=a[F],!!Zh(Z)););if(Z&&Qo(Z)&&Ys(Z,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=T.exp?Bc(T.exp,fo(x,I,m++),_p):fo(x,I,m++)}else t.onError(At(30,T.loc))}else if(_){o=!0;const F=_.forParseResult;F?(cv(F),l.push(Kt(t.helper(Vd),[F.source,Li(jc(F),fo(x,I),!0)]))):t.onError(At(32,_.loc))}else{if(A){if(p.has(A)){t.onError(At(38,C));continue}p.add(A),A==="default"&&(d=!0)}i.push(zt(x,I))}}if(!r){const R=(O,y)=>{const v=s(O,void 0,y,n);return t.compatConfig&&(v.isNonScopedSlot=!0),zt("default",v)};c?u.length&&!u.every(Xd)&&(d?t.onError(At(39,u[0].loc)):i.push(R(void 0,u))):i.push(R(void 0,a))}const h=o?2:Eo(e.children)?3:1;let g=Qs(i.concat(zt("_",Ze(h+"",!1))),n);return l.length&&(g=Kt(t.helper(zh),[g,Pn(l)])),{slots:g,hasDynamicSlots:o}}function fo(e,t,s){const a=[zt("name",e),zt("fn",t)];return s!=null&&a.push(zt("key",Ze(String(s),!0))),Qs(a)}function Eo(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Eo(s.children))return!0;break;case 9:if(Eo(s.branches))return!0;break;case 10:case 11:if(Eo(s.children))return!0;break}}return!1}const dv=new WeakMap,q_=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?G_(e,t):`"${a}"`;const o=dt(l)&&l.callee===Bd;let r,c,d=0,u,p,m,h=o||l===vl||l===Dd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const g=uv(e,t,void 0,i,o);r=g.props,d=g.patchFlag,p=g.dynamicPropNames;const R=g.directives;m=R&&R.length?Pn(R.map(O=>K_(O,t))):void 0,g.shouldUseBlock&&(h=!0)}if(e.children.length>0)if(l===Ko&&(h=!0,d|=1024),i&&l!==vl&&l!==Ko){const{slots:R,hasDynamicSlots:O}=V_(e,t);c=R,O&&(d|=1024)}else if(e.children.length===1&&l!==vl){const R=e.children[0],O=R.type,y=O===5||O===8;y&&Bs(R,t)===0&&(d|=1),y||O===2?c=R:c=e.children}else c=e.children;p&&p.length&&(u=J_(p)),e.codegenNode=Nl(t,l,r,c,d===0?void 0:d,u,m,!!h,!1,i,e.loc)};function G_(e,t,s=!1){let{tag:a}=e;const n=Vc(a),i=Er(e,"is",!1,!0);if(i)if(n||Fn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ze(i.value.content,!0):(o=i.exp,o||(o=Ze("is",!1,i.arg.loc))),o)return Kt(t.helper(Bd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=Vh(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(Ud),t.components.add(a),Dl(a,"component"))}function uv(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let m=!1,h=0,g=!1,R=!1,O=!1,y=!1,v=!1,b=!1;const x=[],k=I=>{c.length&&(d.push(Qs(wp(c),o)),c=[]),I&&d.push(I)},C=()=>{t.scopes.vFor>0&&c.push(zt(Ze("ref_for",!0),Ze("true")))},A=({key:I,value:U})=>{if(Ns(I)){const T=I.content,F=Hn(T);if(F&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Ga(T)&&(y=!0),F&&Ga(T)&&(b=!0),F&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&Bs(U,t)>0)return;T==="ref"?g=!0:T==="class"?R=!0:T==="style"?O=!0:T!=="key"&&!x.includes(T)&&x.push(T),a&&(T==="class"||T==="style")&&!x.includes(T)&&x.push(T)}else v=!0};for(let I=0;I<s.length;I++){const U=s[I];if(U.type===6){const{loc:T,name:F,nameLoc:Z,value:W}=U;let M=!0;if(F==="ref"&&(g=!0,C()),F==="is"&&(Vc(l)||W&&W.content.startsWith("vue:")||Fn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(zt(Ze(F,!0,Z),Ze(W?W.content:"",M,W?W.loc:T)))}else{const{name:T,arg:F,exp:Z,loc:W,modifiers:M}=U,L=T==="bind",D=T==="on";if(T==="slot"){a||t.onError(At(40,W));continue}if(T==="once"||T==="memo"||T==="is"||L&&In(F,"is")&&(Vc(l)||Fn("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((L&&In(F,"key")||D&&p&&In(F,"vue:before-update"))&&(m=!0),L&&In(F,"ref")&&C(),!F&&(L||D)){if(v=!0,Z)if(L){if(k(),Fn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Z);continue}C(),k(),d.push(Z)}else k({type:14,loc:W,callee:t.helper(Wd),arguments:a?[Z]:[Z,"true"]});else t.onError(At(L?34:35,W));continue}L&&M.some(ie=>ie.content==="prop")&&(h|=32);const le=t.directiveTransforms[T];if(le){const{props:ie,needRuntime:B}=le(U,e,t);!i&&ie.forEach(A),D&&F&&!Ns(F)?k(Qs(ie,o)):c.push(...ie),B&&(u.push(U),gs(B)&&dv.set(U,B))}else Ug(T)||(u.push(U),p&&(m=!0))}}let _;if(d.length?(k(),d.length>1?_=Kt(t.helper(Jo),d,o):_=d[0]):c.length&&(_=Qs(wp(c),o)),v?h|=16:(R&&!a&&(h|=2),O&&!a&&(h|=4),x.length&&(h|=8),y&&(h|=32)),!m&&(h===0||h===32)&&(g||b||u.length>0)&&(h|=512),!t.inSSR&&_)switch(_.type){case 15:let I=-1,U=-1,T=!1;for(let W=0;W<_.properties.length;W++){const M=_.properties[W].key;Ns(M)?M.content==="class"?I=W:M.content==="style"&&(U=W):M.isHandlerKey||(T=!0)}const F=_.properties[I],Z=_.properties[U];T?_=Kt(t.helper(Ll),[_]):(F&&!Ns(F.value)&&(F.value=Kt(t.helper(qd),[F.value])),Z&&(O||Z.value.type===4&&Z.value.content.trim()[0]==="["||Z.value.type===17)&&(Z.value=Kt(t.helper(Gd),[Z.value])));break;case 14:break;default:_=Kt(t.helper(Ll),[Kt(t.helper(Jl),[_])]);break}return{props:_,directives:u,patchFlag:h,dynamicPropNames:x,shouldUseBlock:m}}function wp(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Hn(i))&&W_(l,n):(t.set(i,n),s.push(n))}return s}function W_(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Pn([e.value,t.value],e.loc)}function K_(e,t){const s=[],a=dv.get(e);a?s.push(t.helperString(a)):(t.helper(zd),t.directives.add(e.name),s.push(Dl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ze("true",!1,n);s.push(Qs(e.modifiers.map(l=>zt(l,i)),n))}return Pn(s,e.loc)}function J_(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function Vc(e){return e==="component"||e==="Component"}const Z_=(e,t)=>{if(Xo(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Y_(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Li([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Kt(t.helper(Bh),l,a)}};function Y_(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=_t(l.name),n.push(l)));else if(l.name==="bind"&&In(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=_t(l.arg.content);s=l.exp=Ze(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Ns(l.arg)&&(l.arg.content=_t(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=uv(e,t,n,!1,!1);a=i,l.length&&t.onError(At(36,l[0].loc))}return{slotName:s,slotProps:a}}const pv=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(At(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?bi(_t(u)):`on:${u}`;o=Ze(p,!0,l.loc)}else o=oa([`${s.helperString(Uc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Uc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=Wh(r),p=!(u||Z0(r)),m=r.content.includes(";");(p||c&&u)&&(r=oa([`${p?"$event":"(...args)"} => ${m?"{":"("}`,r,m?"}":")"]))}let d={props:[zt(o,r||Ze("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Q_=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=_t(i.content):i.content=`${s.helperString($c)}(${i.content})`:(i.children.unshift(`${s.helperString($c)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&kp(i,"."),a.some(o=>o.content==="attr")&&kp(i,"^")),{props:[zt(i,l)]}},kp=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},X_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(ac(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(ac(r))a||(a=s[i]=oa([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(ac(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Bs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Kt(t.helper($d),o)}}}}},Sp=new WeakSet,ew=(e,t)=>{if(e.type===1&&Ys(e,"once",!0))return Sp.has(e)||t.inVOnce||t.inSSR?void 0:(Sp.add(e),t.inVOnce=!0,t.helper(Zo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},fv=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(At(41,e.loc)),Qi();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(At(44,a.loc)),Qi();if(o==="literal-const"||o==="setup-const")return s.onError(At(45,a.loc)),Qi();if(!l.trim()||!Wh(a))return s.onError(At(42,a.loc)),Qi();const r=n||Ze("modelValue",!0),c=n?Ns(n)?`onUpdate:${_t(n.content)}`:oa(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=oa([`${u} => ((`,a,") = $event)"]);const p=[zt(r,e.exp),zt(c,d)];if(e.modifiers.length&&t.tagType===1){const m=e.modifiers.map(g=>g.content).map(g=>(Qd(g)?g:JSON.stringify(g))+": true").join(", "),h=n?Ns(n)?`${n.content}Modifiers`:oa([n,' + "Modifiers"']):"modelModifiers";p.push(zt(h,Ze(`{ ${m} }`,!1,e.loc,2)))}return Qi(p)};function Qi(e=[]){return{props:e}}const tw=/[\w).+\-_$\]]/,sw=(e,t)=>{Fn("COMPILER_FILTERS",t)&&(e.type===5?tr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&tr(s.exp,t)}))};function tr(e,t){if(e.type===4)Tp(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Tp(a,t):a.type===8?tr(e,t):a.type===5&&tr(a.content,t))}}function Tp(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,m,h,g=[];for(m=0;m<s.length;m++)if(p=u,u=s.charCodeAt(m),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(m+1)!==124&&s.charCodeAt(m-1)!==124&&!o&&!r&&!c)h===void 0?(d=m+1,h=s.slice(0,m).trim()):R();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let O=m-1,y;for(;O>=0&&(y=s.charAt(O),y===" ");O--);(!y||!tw.test(y))&&(l=!0)}}h===void 0?h=s.slice(0,m).trim():d!==0&&R();function R(){g.push(s.slice(d,m).trim()),d=m+1}if(g.length){for(m=0;m<g.length;m++)h=aw(h,g[m],t);e.content=h,e.ast=void 0}}function aw(e,t,s){s.helper(Hd);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${Dl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${Dl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Cp=new WeakSet,nw=(e,t)=>{if(e.type===1){const s=Ys(e,"memo");return!s||Cp.has(e)||t.inSSR?void 0:(Cp.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&Zd(a,t),e.codegenNode=Kt(t.helper(Jd),[s.exp,Li(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},iw=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(At(53,a.loc)),s.exp=Ze("",!0,a.loc);else{const n=_t(a.content);(qh.test(n[0])||n[0]==="-")&&(s.exp=Ze(n,!1,a.loc))}}}};function lw(e){return[[iw,ew,P_,nw,U_,sw,Z_,q_,H_,X_],{on:pv,bind:Q_,model:fv}]}function ow(e,t={}){const s=t.onError||Yd,a=t.mode==="module";t.prefixIdentifiers===!0?s(At(48)):a&&s(At(49));const n=!1;t.cacheHandlers&&s(At(50)),t.scopeId&&!a&&s(At(51));const i=tt({},t,{prefixIdentifiers:n}),l=Ge(e)?f_(e,i):e,[o,r]=lw();return g_(l,tt({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:tt({},r,t.directiveTransforms||{})})),__(l,i)}const rw=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const mv=Symbol(""),hv=Symbol(""),vv=Symbol(""),gv=Symbol(""),qc=Symbol(""),bv=Symbol(""),yv=Symbol(""),xv=Symbol(""),_v=Symbol(""),wv=Symbol("");U0({[mv]:"vModelRadio",[hv]:"vModelCheckbox",[vv]:"vModelText",[gv]:"vModelSelect",[qc]:"vModelDynamic",[bv]:"withModifiers",[yv]:"withKeys",[xv]:"vShow",[_v]:"Transition",[wv]:"TransitionGroup"});let ii;function cw(e,t=!1){return ii||(ii=document.createElement("div")),t?(ii.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,ii.children[0].getAttribute("foo")):(ii.innerHTML=e,ii.textContent)}const dw={parseMode:"html",isVoidTag:sb,isNativeTag:e=>Xg(e)||eb(e)||tb(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:cw,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return _v;if(e==="TransitionGroup"||e==="transition-group")return wv},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},uw=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ze("style",!0,t.loc),exp:pw(t.value.content,t.loc),modifiers:[],loc:t.loc})})},pw=(e,t)=>{const s=Df(e);return Ze(JSON.stringify(s),!1,t,3)};function gn(e,t){return At(e,t)}const fw=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(gn(54,n)),t.children.length&&(s.onError(gn(55,n)),t.children.length=0),{props:[zt(Ze("innerHTML",!0,n),a||Ze("",!0))]}},mw=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(gn(56,n)),t.children.length&&(s.onError(gn(57,n)),t.children.length=0),{props:[zt(Ze("textContent",!0),a?Bs(a,s)>0?a:Kt(s.helperString(Cr),[a],n):Ze("",!0))]}},hw=(e,t,s)=>{const a=fv(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(gn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=vv,o=!1;if(n==="input"||i){const r=Er(t,"type");if(r){if(r.type===7)l=qc;else if(r.value)switch(r.value.content){case"radio":l=mv;break;case"checkbox":l=hv;break;case"file":o=!0,s.onError(gn(60,e.loc));break}}else Y0(t)&&(l=qc)}else n==="select"&&(l=gv);o||(a.needRuntime=s.helper(l))}else s.onError(gn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},vw=Hs("passive,once,capture"),gw=Hs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),bw=Hs("left,right"),kv=Hs("onkeyup,onkeydown,onkeypress"),yw=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&Ml("COMPILER_V_ON_NATIVE",s)||vw(r)?l.push(r):bw(r)?Ns(e)?kv(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):gw(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Ep=(e,t)=>Ns(e)&&e.content.toLowerCase()==="onclick"?Ze(t,!0):e.type!==4?oa(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,xw=(e,t,s)=>pv(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=yw(i,n,s,e.loc);if(r.includes("right")&&(i=Ep(i,"onContextmenu")),r.includes("middle")&&(i=Ep(i,"onMouseup")),r.length&&(l=Kt(s.helper(bv),[l,JSON.stringify(r)])),o.length&&(!Ns(i)||kv(i.content.toLowerCase()))&&(l=Kt(s.helper(yv),[l,JSON.stringify(o)])),c.length){const d=c.map(Vn).join("");i=Ns(i)?Ze(`${i.content}${d}`,!0):oa(["(",i,`) + "${d}"`])}return{props:[zt(i,l)]}}),_w=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(gn(62,n)),{props:[],needRuntime:s.helper(xv)}},ww=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},kw=[uw],Sw={cloak:rw,html:fw,text:mw,model:hw,on:xw,show:_w};function Tw(e,t={}){return ow(e,tt({},dw,t,{nodeTransforms:[ww,...kw,...t.nodeTransforms||[]],directiveTransforms:tt({},Sw,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ap=Object.create(null);function Cw(e,t){if(!Ge(e))if(e.nodeType)e=e.innerHTML;else return os;const s=Hg(e,t),a=Ap[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=tt({hoistStatic:!0,onError:void 0,onWarn:os},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=Tw(e,n),l=new Function("Vue",i)(N0);return l._rc=!0,Ap[s]=l}lh(Cw);const sr=yn({items:[]});let Ew=1;function Ir(e,t="info",s=3e3){const a=Ew++;return sr.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>su(a),s),a}function su(e){const t=sr.items.findIndex(s=>s.id===e);t>=0&&sr.items.splice(t,1)}function Se(e,t="info",s=3e3){return Ir(e,t,s)}Se.success=(e,t=3e3)=>Ir(e,"success",t);Se.error=(e,t=5e3)=>Ir(e,"error",t);Se.info=(e,t=3e3)=>Ir(e,"info",t);Se.dismiss=su;const Aw={setup(){return{state:sr,dismiss:su}},template:`
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
  `},Ba=yn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Si=null;function es({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return Si&&Si(!1),Ba.title=e,Ba.message=t,Ba.confirmLabel=s,Ba.cancelLabel=a,Ba.danger=n,Ba.open=!0,new Promise(i=>{Si=i})}function Rp(e){Ba.open=!1,Si&&(Si(e),Si=null)}const Rw={setup(){function e(t){Ba.open&&t.key==="Escape"&&(t.stopPropagation(),Rp(!1))}return Qe(()=>document.addEventListener("keydown",e,!0)),bt(()=>document.removeEventListener("keydown",e,!0)),{state:Ba,settle:Rp}},template:`
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
 */const ui=typeof document<"u";function Sv(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Iw(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Sv(e.default)}const vt=Object.assign;function ic(e,t){const s={};for(const a in t){const n=t[a];s[a]=ca(n)?n.map(e):e(n)}return s}const gl=()=>{},ca=Array.isArray;function Ip(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Tv=/#/g,Ow=/&/g,Lw=/\//g,Nw=/=/g,Mw=/\?/g,Cv=/\+/g,Dw=/%5B/g,Pw=/%5D/g,Ev=/%5E/g,Fw=/%60/g,Av=/%7B/g,$w=/%7C/g,Rv=/%7D/g,Uw=/%20/g;function au(e){return e==null?"":encodeURI(""+e).replace($w,"|").replace(Dw,"[").replace(Pw,"]")}function Bw(e){return au(e).replace(Av,"{").replace(Rv,"}").replace(Ev,"^")}function Gc(e){return au(e).replace(Cv,"%2B").replace(Uw,"+").replace(Tv,"%23").replace(Ow,"%26").replace(Fw,"`").replace(Av,"{").replace(Rv,"}").replace(Ev,"^")}function zw(e){return Gc(e).replace(Nw,"%3D")}function Hw(e){return au(e).replace(Tv,"%23").replace(Mw,"%3F")}function jw(e){return Hw(e).replace(Lw,"%2F")}function Fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Vw=/\/$/,qw=e=>e.replace(Vw,"");function lc(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=Jw(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:Fl(l)}}function Gw(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Op(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Ww(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&Di(t.matched[a],s.matched[n])&&Iv(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Di(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Iv(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Kw(e[s],t[s]))return!1;return!0}function Kw(e,t){return ca(e)?Lp(e,t):ca(t)?Lp(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Lp(e,t){return ca(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function Jw(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const rn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Wc=(function(e){return e.pop="pop",e.push="push",e})({}),oc=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Zw(e){if(!e)if(ui){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),qw(e)}const Yw=/^[^#]+#/;function Qw(e,t){return e.replace(Yw,"#")+t}function Xw(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const Or=()=>({left:window.scrollX,top:window.scrollY});function ek(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Xw(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Np(e,t){return(history.state?history.state.position-t:-1)+e}const Kc=new Map;function tk(e,t){Kc.set(e,t)}function sk(e){const t=Kc.get(e);return Kc.delete(e),t}function ak(e){return typeof e=="string"||e&&typeof e=="object"}function Ov(e){return typeof e=="string"||typeof e=="symbol"}let Nt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Lv=Symbol("");Nt.MATCHER_NOT_FOUND+"",Nt.NAVIGATION_GUARD_REDIRECT+"",Nt.NAVIGATION_ABORTED+"",Nt.NAVIGATION_CANCELLED+"",Nt.NAVIGATION_DUPLICATED+"";function Pi(e,t){return vt(new Error,{type:e,[Lv]:!0},t)}function Da(e,t){return e instanceof Error&&Lv in e&&(t==null||!!(e.type&t))}const nk=["params","query","hash"];function ik(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of nk)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function lk(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Cv," "),i=n.indexOf("="),l=Fl(i<0?n:n.slice(0,i)),o=i<0?null:Fl(n.slice(i+1));if(l in t){let r=t[l];ca(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Mp(e){let t="";for(let s in e){const a=e[s];if(s=zw(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(ca(a)?a.map(n=>n&&Gc(n)):[a&&Gc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function ok(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=ca(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const rk=Symbol(""),Dp=Symbol(""),Lr=Symbol(""),nu=Symbol(""),Jc=Symbol("");function Xi(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function mn(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(Pi(Nt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):ak(p)?r(Pi(Nt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function rc(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Sv(r)){const c=(r.__vccOpts||r)[t];c&&i.push(mn(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=Iw(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&mn(p,s,a,l,o,n)()}))}}return i}function ck(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>Di(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>Di(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let dk=()=>location.protocol+"//"+location.host;function Nv(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),Op(o,"")}return Op(s,e)+a+n}function uk(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const m=Nv(e,location),h=s.value,g=t.value;let R=0;if(p){if(s.value=m,t.value=p,l&&l===h){l=null;return}R=g?p.position-g.position:0}else a(m);n.forEach(O=>{O(s.value,h,{delta:R,type:Wc.pop,direction:R?R>0?oc.forward:oc.back:oc.unknown})})};function r(){l=s.value}function c(p){n.push(p);const m=()=>{const h=n.indexOf(p);h>-1&&n.splice(h,1)};return i.push(m),m}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(vt({},p.state,{scroll:Or()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Pp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?Or():null}}function pk(e){const{history:t,location:s}=window,a={value:Nv(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:dk()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(m){console.error(m),s[d?"replace":"assign"](p)}}function l(r,c){i(r,vt({},t.state,Pp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=vt({},n.value,t.state,{forward:r,scroll:Or()});i(d.current,d,!0),i(r,vt({},Pp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function fk(e){e=Zw(e);const t=pk(e),s=uk(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=vt({location:"",base:e,go:a,createHref:Qw.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function mk(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),fk(e)}let Ln=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Gt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Gt||{});const hk={type:Ln.Static,value:""},vk=/[a-zA-Z0-9_]/;function gk(e){if(!e)return[[]];if(e==="/")return[[hk]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(m){throw new Error(`ERR (${s})/"${c}": ${m}`)}let s=Gt.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Gt.Static?i.push({type:Ln.Static,value:c}):s===Gt.Param||s===Gt.ParamRegExp||s===Gt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Ln.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Gt.ParamRegExp){a=s,s=Gt.EscapeNext;continue}switch(s){case Gt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Gt.Param):p();break;case Gt.EscapeNext:p(),s=a;break;case Gt.Param:r==="("?s=Gt.ParamRegExp:vk.test(r)?p():(u(),s=Gt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Gt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Gt.ParamRegExpEnd:d+=r;break;case Gt.ParamRegExpEnd:u(),s=Gt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Gt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const Fp="[^/]+?",bk={sensitive:!1,strict:!1,start:!0,end:!0};var ws=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ws||{});const yk=/[.+*?^${}()[\]/\\]/g;function xk(e,t){const s=vt({},bk,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ws.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let m=ws.Segment+(s.sensitive?ws.BonusCaseSensitive:0);if(p.type===Ln.Static)u||(n+="/"),n+=p.value.replace(yk,"\\$&"),m+=ws.Static;else if(p.type===Ln.Param){const{value:h,repeatable:g,optional:R,regexp:O}=p;i.push({name:h,repeatable:g,optional:R});const y=O||Fp;if(y!==Fp){m+=ws.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${h}" (${y}): `+b.message)}}let v=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(v=R&&c.length<2?`(?:/${v})`:"/"+v),R&&(v+="?"),n+=v,m+=ws.Dynamic,R&&(m+=ws.BonusOptional),g&&(m+=ws.BonusRepeatable),y===".*"&&(m+=ws.BonusWildcard)}d.push(m)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=ws.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const m=d[p]||"",h=i[p-1];u[h.name]=m&&h.repeatable?m.split("/"):m}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const m of p)if(m.type===Ln.Static)d+=m.value;else if(m.type===Ln.Param){const{value:h,repeatable:g,optional:R}=m,O=h in c?c[h]:"";if(ca(O)&&!g)throw new Error(`Provided param "${h}" is an array but it is not repeatable (* or + modifiers)`);const y=ca(O)?O.join("/"):O;if(!y)if(R)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${h}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function _k(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===ws.Static+ws.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ws.Static+ws.Segment?1:-1:0}function Mv(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=_k(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if($p(a))return 1;if($p(n))return-1}return n.length-a.length}function $p(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const wk={strict:!1,end:!0,sensitive:!1};function kk(e,t,s){const a=xk(gk(e.path),s),n=vt(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function Sk(e,t){const s=[],a=new Map;t=Ip(wk,t);function n(u){return a.get(u)}function i(u,p,m){const h=!m,g=Bp(u);g.aliasOf=m&&m.record;const R=Ip(t,u),O=[g];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const x of b)O.push(Bp(vt({},g,{components:m?m.record.components:g.components,path:x,aliasOf:m?m.record:g})))}let y,v;for(const b of O){const{path:x}=b;if(p&&x[0]!=="/"){const k=p.record.path,C=k[k.length-1]==="/"?"":"/";b.path=p.record.path+(x&&C+x)}if(y=kk(b,p,R),m?m.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),h&&u.name&&!zp(y)&&l(u.name)),Dv(y)&&r(y),g.children){const k=g.children;for(let C=0;C<k.length;C++)i(k[C],y,m&&m.children[C])}m=m||y}return v?()=>{l(v)}:gl}function l(u){if(Ov(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Ek(u,s);s.splice(p,0,u),u.record.name&&!zp(u)&&a.set(u.record.name,u)}function c(u,p){let m,h={},g,R;if("name"in u&&u.name){if(m=a.get(u.name),!m)throw Pi(Nt.MATCHER_NOT_FOUND,{location:u});R=m.record.name,h=vt(Up(p.params,m.keys.filter(v=>!v.optional).concat(m.parent?m.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),u.params&&Up(u.params,m.keys.map(v=>v.name))),g=m.stringify(h)}else if(u.path!=null)g=u.path,m=s.find(v=>v.re.test(g)),m&&(h=m.parse(g),R=m.record.name);else{if(m=p.name?a.get(p.name):s.find(v=>v.re.test(p.path)),!m)throw Pi(Nt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});R=m.record.name,h=vt({},p.params,u.params),g=m.stringify(h)}const O=[];let y=m;for(;y;)O.unshift(y.record),y=y.parent;return{name:R,path:g,params:h,matched:O,meta:Ck(O)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function Up(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function Bp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Tk(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Tk(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function zp(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Ck(e){return e.reduce((t,s)=>vt(t,s.meta),{})}function Ek(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;Mv(e,t[i])<0?a=i:s=i+1}const n=Ak(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Ak(e){let t=e;for(;t=t.parent;)if(Dv(t)&&Mv(e,t)===0)return t}function Dv({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Hp(e){const t=Xs(Lr),s=Xs(nu),a=j(()=>{const r=_a(e.to);return t.resolve(r)}),n=j(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Di.bind(null,d));if(p>-1)return p;const m=jp(r[c-2]);return c>1&&jp(d)===m&&u[u.length-1].path!==m?u.findIndex(Di.bind(null,r[c-2])):p}),i=j(()=>n.value>-1&&Nk(s.params,a.value.params)),l=j(()=>n.value>-1&&n.value===s.matched.length-1&&Iv(s.params,a.value.params));function o(r={}){if(Lk(r)){const c=t[_a(e.replace)?"replace":"push"](_a(e.to)).catch(gl);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:j(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Rk(e){return e.length===1?e[0]:e}const Ik=ql({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Hp,setup(e,{slots:t}){const s=yn(Hp(e)),{options:a}=Xs(Lr),n=j(()=>({[Vp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[Vp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Rk(t.default(s));return e.custom?i:Ai("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Ok=Ik;function Lk(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Nk(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!ca(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function jp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Vp=(e,t,s)=>e??t??s,Mk=ql({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Xs(Jc),n=j(()=>e.route||a.value),i=Xs(Dp,0),l=j(()=>{let c=_a(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=j(()=>n.value.matched[l.value]);pl(Dp,j(()=>l.value+1)),pl(rk,o),pl(Jc,n);const r=f();return jt(()=>[r.value,o.value,e.name],([c,d,u],[p,m,h])=>{d&&(d.instances[u]=c,m&&m!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=m.leaveGuards),d.updateGuards.size||(d.updateGuards=m.updateGuards))),c&&d&&(!m||!Di(d,m)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return qp(s.default,{Component:p,route:c});const m=u.props[d],h=m?m===!0?c.params:typeof m=="function"?m(c):m:null,R=Ai(p,vt({},h,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return qp(s.default,{Component:R,route:c})||R}}});function qp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Dk=Mk;function Pk(e){const t=Sk(e.routes,e),s=e.parseQuery||lk,a=e.stringifyQuery||Mp,n=e.history,i=Xi(),l=Xi(),o=Xi(),r=md(rn);let c=rn;ui&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=ic.bind(null,K=>""+K),u=ic.bind(null,jw),p=ic.bind(null,Fl);function m(K,he){let ve,ye;return Ov(K)?(ve=t.getRecordMatcher(K),ye=he):ye=K,t.addRoute(ye,ve)}function h(K){const he=t.getRecordMatcher(K);he&&t.removeRoute(he)}function g(){return t.getRoutes().map(K=>K.record)}function R(K){return!!t.getRecordMatcher(K)}function O(K,he){if(he=vt({},he||r.value),typeof K=="string"){const P=lc(s,K,he.path),V=t.resolve({path:P.path},he),pe=n.createHref(P.fullPath);return vt(P,V,{params:p(V.params),hash:Fl(P.hash),redirectedFrom:void 0,href:pe})}let ve;if(K.path!=null)ve=vt({},K,{path:lc(s,K.path,he.path).path});else{const P=vt({},K.params);for(const V in P)P[V]==null&&delete P[V];ve=vt({},K,{params:u(P)}),he.params=u(he.params)}const ye=t.resolve(ve,he),_e=K.hash||"";ye.params=d(p(ye.params));const $e=Gw(a,vt({},K,{hash:Bw(_e),path:ye.path})),E=n.createHref($e);return vt({fullPath:$e,hash:_e,query:a===Mp?ok(K.query):K.query||{}},ye,{redirectedFrom:void 0,href:E})}function y(K){return typeof K=="string"?lc(s,K,r.value.path):vt({},K)}function v(K,he){if(c!==K)return Pi(Nt.NAVIGATION_CANCELLED,{from:he,to:K})}function b(K){return C(K)}function x(K){return b(vt(y(K),{replace:!0}))}function k(K,he){const ve=K.matched[K.matched.length-1];if(ve&&ve.redirect){const{redirect:ye}=ve;let _e=typeof ye=="function"?ye(K,he):ye;return typeof _e=="string"&&(_e=_e.includes("?")||_e.includes("#")?_e=y(_e):{path:_e},_e.params={}),vt({query:K.query,hash:K.hash,params:_e.path!=null?{}:K.params},_e)}}function C(K,he){const ve=c=O(K),ye=r.value,_e=K.state,$e=K.force,E=K.replace===!0,P=k(ve,ye);if(P)return C(vt(y(P),{state:typeof P=="object"?vt({},_e,P.state):_e,force:$e,replace:E}),he||ve);const V=ve;V.redirectedFrom=he;let pe;return!$e&&Ww(a,ye,ve)&&(pe=Pi(Nt.NAVIGATION_DUPLICATED,{to:V,from:ye}),B(ye,ye,!0,!1)),(pe?Promise.resolve(pe):I(V,ye)).catch($=>Da($)?Da($,Nt.NAVIGATION_GUARD_REDIRECT)?$:ie($):D($,V,ye)).then($=>{if($){if(Da($,Nt.NAVIGATION_GUARD_REDIRECT))return C(vt({replace:E},y($.to),{state:typeof $.to=="object"?vt({},_e,$.to.state):_e,force:$e}),he||V)}else $=T(V,ye,!0,E,_e);return U(V,ye,$),$})}function A(K,he){const ve=v(K,he);return ve?Promise.reject(ve):Promise.resolve()}function _(K){const he=J.values().next().value;return he&&typeof he.runWithContext=="function"?he.runWithContext(K):K()}function I(K,he){let ve;const[ye,_e,$e]=ck(K,he);ve=rc(ye.reverse(),"beforeRouteLeave",K,he);for(const P of ye)P.leaveGuards.forEach(V=>{ve.push(mn(V,K,he))});const E=A.bind(null,K,he);return ve.push(E),ne(ve).then(()=>{ve=[];for(const P of i.list())ve.push(mn(P,K,he));return ve.push(E),ne(ve)}).then(()=>{ve=rc(_e,"beforeRouteUpdate",K,he);for(const P of _e)P.updateGuards.forEach(V=>{ve.push(mn(V,K,he))});return ve.push(E),ne(ve)}).then(()=>{ve=[];for(const P of $e)if(P.beforeEnter)if(ca(P.beforeEnter))for(const V of P.beforeEnter)ve.push(mn(V,K,he));else ve.push(mn(P.beforeEnter,K,he));return ve.push(E),ne(ve)}).then(()=>(K.matched.forEach(P=>P.enterCallbacks={}),ve=rc($e,"beforeRouteEnter",K,he,_),ve.push(E),ne(ve))).then(()=>{ve=[];for(const P of l.list())ve.push(mn(P,K,he));return ve.push(E),ne(ve)}).catch(P=>Da(P,Nt.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function U(K,he,ve){o.list().forEach(ye=>_(()=>ye(K,he,ve)))}function T(K,he,ve,ye,_e){const $e=v(K,he);if($e)return $e;const E=he===rn,P=ui?history.state:{};ve&&(ye||E?n.replace(K.fullPath,vt({scroll:E&&P&&P.scroll},_e)):n.push(K.fullPath,_e)),r.value=K,B(K,he,ve,E),ie()}let F;function Z(){F||(F=n.listen((K,he,ve)=>{if(!fe.listening)return;const ye=O(K),_e=k(ye,fe.currentRoute.value);if(_e){C(vt(_e,{replace:!0,force:!0}),ye).catch(gl);return}c=ye;const $e=r.value;ui&&tk(Np($e.fullPath,ve.delta),Or()),I(ye,$e).catch(E=>Da(E,Nt.NAVIGATION_ABORTED|Nt.NAVIGATION_CANCELLED)?E:Da(E,Nt.NAVIGATION_GUARD_REDIRECT)?(C(vt(y(E.to),{force:!0}),ye).then(P=>{Da(P,Nt.NAVIGATION_ABORTED|Nt.NAVIGATION_DUPLICATED)&&!ve.delta&&ve.type===Wc.pop&&n.go(-1,!1)}).catch(gl),Promise.reject()):(ve.delta&&n.go(-ve.delta,!1),D(E,ye,$e))).then(E=>{E=E||T(ye,$e,!1),E&&(ve.delta&&!Da(E,Nt.NAVIGATION_CANCELLED)?n.go(-ve.delta,!1):ve.type===Wc.pop&&Da(E,Nt.NAVIGATION_ABORTED|Nt.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),U(ye,$e,E)}).catch(gl)}))}let W=Xi(),M=Xi(),L;function D(K,he,ve){ie(K);const ye=M.list();return ye.length?ye.forEach(_e=>_e(K,he,ve)):console.error(K),Promise.reject(K)}function le(){return L&&r.value!==rn?Promise.resolve():new Promise((K,he)=>{W.add([K,he])})}function ie(K){return L||(L=!K,Z(),W.list().forEach(([he,ve])=>K?ve(K):he()),W.reset()),K}function B(K,he,ve,ye){const{scrollBehavior:_e}=e;if(!ui||!_e)return Promise.resolve();const $e=!ve&&sk(Np(K.fullPath,0))||(ye||!ve)&&history.state&&history.state.scroll||null;return Pt().then(()=>_e(K,he,$e)).then(E=>E&&ek(E)).catch(E=>D(E,K,he))}const Q=K=>n.go(K);let re;const J=new Set,fe={currentRoute:r,listening:!0,addRoute:m,removeRoute:h,clearRoutes:t.clearRoutes,hasRoute:R,getRoutes:g,resolve:O,options:e,push:b,replace:x,go:Q,back:()=>Q(-1),forward:()=>Q(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:M.add,isReady:le,install(K){K.component("RouterLink",Ok),K.component("RouterView",Dk),K.config.globalProperties.$router=fe,Object.defineProperty(K.config.globalProperties,"$route",{enumerable:!0,get:()=>_a(r)}),ui&&!re&&r.value===rn&&(re=!0,b(n.location).catch(ye=>{}));const he={};for(const ye in rn)Object.defineProperty(he,ye,{get:()=>r.value[ye],enumerable:!0});K.provide(Lr,fe),K.provide(nu,fd(he)),K.provide(Jc,r);const ve=K.unmount;J.add(K),K.unmount=function(){J.delete(K),J.size<1&&(c=rn,F&&F(),F=null,r.value=rn,re=!1,L=!1),ve()}}};function ne(K){return K.reduce((he,ve)=>he.then(()=>_(ve)),Promise.resolve())}return fe}function Pv(){return Xs(Lr)}function Fk(e){return Xs(nu)}const Nr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Fk(),s=Pv(),a=j({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});jt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},$l=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Sa=e=>Number.isSafeInteger(e)&&e>=0,$k=e=>e===null||typeof e=="string",ar=(e,t)=>Sa(e)&&Sa(t)&&t>=e,iu=e=>$l(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&$k(e.cursor);function Uk(e){return!iu(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&$l(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!Sa(e.total_chars)||!Sa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!ar(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&$l(e.tail)&&typeof e.tail.text=="string"&&ar(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function Gp(e){return iu(e)&&e.kind==="process_output"&&Sa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>Sa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&ar(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Bk(e){return iu(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>Sa(e[t]))&&ar(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&Sa(e.tools_omitted)}function Zc(e){try{return JSON.parse(e)}catch{return}}const Yc=e=>JSON.stringify(e,null,2),zk=e=>{const t=Zc(e);return t===void 0?e:Yc(t)},mo=(e,t,s)=>`[${e}, ${t}) ${s}`;function Fv(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:Yc(e)??"";let a=typeof e=="string"?Zc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=Zc(e.slice(d+c.length)),m=e.slice(0,u);Gp(p)&&!("text"in p)&&m.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?zk(d):d});if($l(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||Sa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...Sa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],$l(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(Uk(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${mo(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${mo(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(Gp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>mo(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(Bk(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${mo(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?Yc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function $v(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const cc=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Hk=e=>e!==null&&typeof e=="object",jk=new Set(["_hmac","_prev_hmac"]),Qc=e=>e.replace(/\r\n?/g,`
`);function Ul(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(jk.has(n)){s=!0;return}return i});return Qc(s?JSON.stringify(a):t)}catch{return Qc(t)}}function Vk(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&Hk(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function qk(e){var m;const t=Fv(typeof e=="string"?Qc(e):e,{prettyPrint:!1}),s=t.sections.map(h=>({...h,text:Ul(h.text)})),a=s.map(h=>h.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>cc.inlineChars||o&&n.length>0,c=s.filter(h=>h.text).map(h=>{let g=h.text;try{g=JSON.stringify(JSON.parse(g),null,2)}catch{}return h.label?`${h.label}
${g}`:g}).join(`

`).replace(/\n$/,""),d=$v(c,cc.previewLines,cc.previewChars),u=t.kind==="audit_preview"?(m=t.metadata)==null?void 0:m.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:Vk(t)}}const Gk={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=j(()=>qk(e.value)),c=j(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=j(()=>a.value?c.value:r.value.formatted),u=j(()=>r.value.promoted&&r.value.preview.folded||o.value),p=j(()=>t.value?!!d.value:r.value.promoted),m=j(()=>p.value?"":r.value.summary);let h;function g(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function R(){h==null||h.disconnect();for(const b of[i.value,l.value])b&&(h==null||h.observe(b));g()}function O(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function v(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return jt([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,x)=>{(e.recordId===null||b[2]!==x[2])&&(t.value=!1,a.value=!1),n.value=""}),jt([i,l,t,s,r],()=>Pt(R),{flush:"post"}),Qe(()=>{h=new ResizeObserver(g),R()}),bt(()=>h==null?void 0:h.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:m,toggleExpanded:O,toggleRaw:y,copyOutput:v}},template:`
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
    </section>`},Mr={name:"ToolOutput",components:{CompactOutput:Gk},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=j(()=>Fv(e.value)),l=j(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=j(()=>{let u=30,p=6e3;return l.value.map(m=>{const h=$v(m.text,u,p);return u=Math.max(0,u-h.lines),p=Math.max(0,p-h.chars),{...m,display:t.value?m.text:h.text,folded:h.folded}})}),r=j(()=>o.value.some(u=>u.folded)),c=j(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return jt(()=>e.value,()=>{t.value=!1,n.value=""}),jt(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},Wk={components:{ToolOutput:Mr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var g,R,O,y,v,b,x,k,C,A,_;const m=p.payload||p,h=m.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(h)&&!(m.agent_id||(g=m.metadata)!=null&&g.agent_id))&&!(["loop_tool_start","loop_tool"].includes(h)&&!(m.call_id||(R=m.metadata)!=null&&R.call_id))){if(h==="tool_start"||h==="loop_tool_start"){const I=m.call_id||((O=m.metadata)==null?void 0:O.call_id)||null,U=m.agent_id||((y=m.metadata)==null?void 0:y.agent_id)||"",T={callId:I,agentId:U,agentLabel:m.agent_label||((v=m.metadata)==null?void 0:v.agent_label)||"",toolInput:m.tool_input,id:I?`${U}:${I}`:`${m.action}-${Date.now()}`,tool:m.action,actor:m.actor||"",channel:m.channel_id||"",iteration:m.iteration??((b=m.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(h==="tool_end"||h==="loop_tool"){const I=m.call_id||((x=m.metadata)==null?void 0:x.call_id)||null,U=m.agent_id||((k=m.metadata)==null?void 0:k.agent_id)||"";let T=-1;if(I&&(T=e.value.findIndex(F=>F.callId===I&&F.agentId===U&&F.status==="running")),T<0&&!I)for(let F=e.value.length-1;F>=0;F--){const Z=e.value[F];if(Z.tool===m.action&&Z.agentId===U&&Z.status==="running"){T=F;break}}if(T>=0){const F=e.value[T];F.status=m.error||(C=m.metadata)!=null&&C.error||["error","failed","cancelled","denied","outcome_unknown"].includes(m.status||((A=m.metadata)==null?void 0:A.status))?"error":"success",F.elapsed=m.execution_time_ms??m.duration_ms??((_=m.metadata)==null?void 0:_.elapsed_ms)??Date.now()-F.startTime,F.result=m.result_summary??m.detail??"",F.fadingOut=!0,setTimeout(()=>{const Z=e.value.indexOf(F);Z>=0&&e.value.splice(Z,1),t.value.unshift(F),t.value.length>a&&t.value.pop()},5e3)}return}if(h==="tool_stream"){const I=m.call_id||m.tool_name||"unknown";if(m.finished){const U={...s.value};delete U[I],s.value=U}else{const T=((s.value[I]||"")+(m.chunk||"")).split(`
`);s.value={...s.value,[I]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(m=>{m.status==="running"&&(m.elapsed=p-m.startTime)})}let o=!1;function r(){o||(o=!0,lt.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,lt.off("events",n),i&&(clearInterval(i),i=null))}Qe(r),rs(r),Jt(c),bt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function lu(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Gn(e){const t=lu(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Kk(e){const t=lu(e);return t?t.toLocaleTimeString():"—"}function Uv(e){const t=lu(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Jk(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Fi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function ou(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Bv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Wp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function ru(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function zv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Hv=Symbol("agent-detail-cancelled"),Zk=15e3;function Yk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((m,h)=>{r=m,c=h});function u(m,h){o||(o=!0,l!==null&&n(l),l=null,(m?r:c)(h))}let p;try{p=e(i==null?void 0:i.signal)}catch(m){u(!1,m)}return o||Promise.resolve(p).then(m=>u(!0,m),m=>u(!1,m)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const m=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${m}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Hv),i==null||i.abort()}}}function jv({state:e,requestDetail:t,timeoutMs:s=Zk,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:m,coalesce:h}){if(!p)return Promise.resolve();if(h&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const g={agentId:p,cancel:null,promise:null};l=g,m?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const R=Yk(O=>t(p,{signal:O}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return g.cancel=R.cancel,g.promise=(async()=>{let O=null,y=null;try{O=await R.promise}catch(v){y=v}O!==Hv&&(l!==g||e.detailId!==p||(l=null,!y&&(O===null||typeof O!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Qk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const Xk={components:{ToolOutput:Mr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=j(()=>e.value.filter(D=>D.status==="running").length),r=j(()=>e.value.filter(D=>D.status==="completed").length),c=j(()=>e.value.filter(D=>["failed","timeout","killed"].includes(D.status)).length),d=j(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=j(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(D=>["failed","timeout","killed"].includes(D.status)):e.value.filter(D=>D.status===i.value));function p(D){const le=Number(D.max_iterations)||0;return le<=0?0:Math.min(100,Math.round(D.iteration_count/le*100))}function m(D){return(Number(D.max_iterations)||0)>0}function h(D,le){return D?D==="N/A"?"N/A":le==="current_inheritance"?`inherit (currently ${D})`:D:"unknown"}function g(D){return h(D.display_model,D.display_model_source||D.display_source)}function R(D){return h(D.display_reasoning_effort,D.display_reasoning_effort_source||D.display_source)}function O(D){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[D]||""}const y=f(null),v=f(null),b=f(!1),x=f(null),k=f(""),A=jv({state:{get detail(){return y.value},set detail(D){y.value=D},get detailId(){return v.value},set detailId(D){v.value=D},get detailLoading(){return b.value},set detailLoading(D){b.value=D},get detailError(){return x.value},set detailError(D){x.value=D}},requestDetail:(D,{signal:le})=>z.get(`/api/agents/${encodeURIComponent(D)}`,{signal:le})});async function _(D){k.value="",await A.open(D.id)}function I(){A.close(),k.value=""}async function U(){await A.refresh()}async function T(D,le){try{await navigator.clipboard.writeText(le||""),k.value=D,setTimeout(()=>{k.value===D&&(k.value="")},1500)}catch{Se.error("Copy failed")}}async function F(D=!1){D=D===!0,D||(t.value=!0);try{const le=await z.get("/api/agents");e.value=Array.isArray(le)?le:[],s.value=null}catch(le){D||(s.value=le.message)}D||(t.value=!1)}async function Z(D){const le=e.value.find(B=>B.id===D);if(await es({title:"Kill agent",message:`Kill agent "${(le==null?void 0:le.label)||D}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=D;try{await z.del(`/api/agents/${encodeURIComponent(D)}`),Se.success("Agent killed"),await F()}catch(B){Se.error(B.message||"Failed to kill agent")}a.value=null}}const W=Qk({isEnabled:()=>n.value&&l,refreshList:()=>F(!0),hasOpenDetail:()=>!!v.value,refreshDetail:U});function M(){W.start()}function L(){W.stop()}return jt(n,()=>W.sync()),Qe(()=>{l=!0,F(),M()}),rs(()=>{l=!0,F(!0),M()}),Jt(()=>{l=!1,L()}),bt(()=>{l=!1,L(),A.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Gn,formatDuration:Fi,progressPercent:p,hasProgress:m,displayModelText:g,displayEffortText:R,displaySourceLabel:O,detail:y,detailId:v,detailLoading:b,detailError:x,copied:k,openDetail:_,closeDetail:I,copyText:T,fetchAgents:F,killAgent:Z,startAutoRefresh:M,stopAutoRefresh:L}}},eS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),m=f("");let h=!1;const R=jv({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:D})=>z.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:D})});async function O(L){m.value="",await R.open(L.id)}function y(){R.close(),m.value=""}async function v(L,D){try{await navigator.clipboard.writeText(D||""),m.value=L,setTimeout(()=>{m.value===L&&(m.value="")},1500)}catch{Se.error("Copy failed")}}const b=j(()=>e.value.reduce((L,D)=>L+(D.iteration_count||0),0)),x=j(()=>e.value.filter(L=>L.status==="running").length);function k(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function C(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function A(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function _(L=!1){L=L===!0,L||(t.value=!0);try{const D=await z.get("/api/loops");e.value=Array.isArray(D)?D:[],s.value=null}catch(D){L||(s.value=D.message)}L||(t.value=!1)}async function I(){l.value=null;const L=n.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const D={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(D.stop_condition=L.stop_condition.trim()),i.value=!0;try{const le=await z.post("/api/loops",D);Se.success(`Loop started: ${le.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await _()}catch(le){l.value=le.message}i.value=!1}async function U(L){if(await es({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await z.del(`/api/loops/${encodeURIComponent(L)}`),Se.success("Loop stopped"),await _()}catch(le){Se.error(le.message||"Failed to stop loop")}o.value=null}}async function T(L){r.value=L;try{await z.post(`/api/loops/${encodeURIComponent(L)}/restart`),Se.success("Loop restarted"),await _()}catch(D){Se.error(D.message||"Failed to restart loop")}r.value=null}function F(L){h&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(_(!0),d.value&&R.refresh())}let Z=null;function W(){Z!==null&&clearInterval(Z),Z=null}function M(){W(),h&&(Z=setInterval(()=>{_(!0),d.value&&R.refresh()},5e3))}return Qe(()=>{h=!0,_(),lt.subscribe("events",F),M()}),rs(()=>{h=!0,_(!0),M()}),Jt(()=>{h=!1,W()}),bt(()=>{h=!1,lt.unsubscribe("events",F),W(),R.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:m,totalIterations:b,runningCount:x,statusDotClass:k,statusBadge:C,modeBadge:A,formatAge:Uv,formatDuration:Fi,formatTs:Gn,formatTokens:zv,openDetail:O,closeDetail:y,copyText:v,fetchLoops:_,doCreate:I,doStop:U,doRestart:T}}},tS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=j(()=>e.value.filter(y=>y.status==="running").length),o=j(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await z.get("/api/processes"),s.value=null}catch(v){y||(s.value=v.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}jt(a,y=>{y?u():p()});async function m(y){if(await es({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await z.del(`/api/processes/${y}`),Se.success(`Process ${y} killed`),await d()}catch(b){Se.error(b.message||"Failed to kill process")}i.value=null}}function h(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let g=!1;function R(){g||(g=!0,d(),lt.subscribe("events",h),u())}function O(){g&&(g=!1,lt.unsubscribe("events",h),p())}return Qe(R),rs(R),Jt(O),bt(O),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:Fi,fetchProcesses:d,doKill:m}}},sS=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Kp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function aS(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function nS(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function iS(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=sS.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),m=new Date(u+864e5).getTimezoneOffset(),h=[];for(const R of new Set([p,m])){const O=new Date(u+R*6e4);aS(O,c)===d&&(h.some(y=>y.getTime()===O.getTime())||h.push(O))}if(h.sort((R,O)=>R.getTime()-O.getTime()),h.length===0)return{state:"nonexistent",typed:t};if(h.length>1)return{state:"ambiguous",typed:t,options:h.map(R=>({instant:R,offset:nS(R),iso:R.toISOString()}))};const g=h[0];return{state:"ok",typed:t,instant:g,iso:g.toISOString()}}const lS=5e3;function Ao(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function ho(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function Jp(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:Ao(e.data.connection)}function oS(e){return e!=="webhook"}function Zp(e,t){return!oS(t)||(e==null?void 0:e.available)===!0}const rS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(Ao(null)),n=j(()=>a.value.available),i=j(()=>ho(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=j(()=>Zp(a.value,r.value.action));function p($){return Zp(a.value,$)}const m=f(null),h=j(()=>iS(r.value.run_at));jt(()=>r.value.run_at,()=>{m.value=null});const g=j(()=>{var Y;const $=h.value;return $.state==="ok"?$.instant:$.state==="ambiguous"&&m.value!==null&&((Y=$.options[m.value])==null?void 0:Y.instant)||null}),R=j(()=>{const $=g.value;return $?`${$.toLocaleString()} local — ${$.toISOString()} UTC`:""}),O=f(null),y=f(!1),v=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=f(null),x=f(null),k=f(null),C=f(null),A=f(null),_=f(null),I=f([]),U=f(!1),T=f("");let F=0;const Z=j(()=>e.value.filter($=>$.cron&&!$.one_time).length),W=j(()=>e.value.filter($=>$.one_time).length),M=j(()=>e.value.filter($=>$.trigger).length),L=j(()=>e.value.filter($=>$.paused).length),D=j(()=>e.value.filter($=>$.consecutive_failures>0).length);function le($){if(!$)return"-";const Y=Date.now(),H=(new Date($).getTime()-Y)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const X=Math.floor(H/3600),be=Math.floor(H%3600/60);return be>0?`in ${X}h ${be}m`:`in ${X}h`}const te=Math.floor(H/86400);return`in ${te} day${te!==1?"s":""}`}function ie($){return $==null?"-":$<1e3?`${$}ms`:$<6e4?`${($/1e3).toFixed(1)}s`:Fi($/1e3)}function B($=r.value.cron){r.value.cron=$,Kp(r.value,"cron"),O.value=null}function Q($=r.value.run_at){r.value.run_at=$,Kp(r.value,"run_at"),O.value=null}async function re(){const $=r.value.cron.trim();if($){y.value=!0;try{O.value=await z.post("/api/schedules/validate-cron",{expression:$})}catch(Y){O.value={valid:!1,error:Y.message}}y.value=!1}}async function J(){t.value=!0,s.value=null;try{e.value=await z.get("/api/schedules")}catch($){s.value=$.message}t.value=!1}async function fe(){try{a.value=Ao(await z.get("/api/schedules/status"))}catch($){a.value=Jp($)||Ao(null)}}function ne($){const Y=Jp($);Y&&(a.value=Y)}async function K($){if(_.value===$){_.value=null,I.value=[];return}_.value=$,U.value=!0,I.value=[];const Y=++F;try{const ue=await z.get(`/api/schedules/${encodeURIComponent($)}/history?limit=10`);if(Y!==F||_.value!==$)return;I.value=ue,T.value=""}catch(ue){if(Y!==F||_.value!==$)return;I.value=[],T.value=ue.message||"Failed to load execution history"}Y===F&&(U.value=!1)}async function he(){if(d.value=null,!p(r.value.action)){d.value=ho(a.value);return}const $=r.value;if(!$.description.trim()){d.value="Description is required";return}if($.action!=="webhook"&&!$.channel_id.trim()){d.value="Channel ID is required";return}if(!$.cron.trim()&&!$.run_at.trim()){d.value="Cron expression or run_at time is required";return}if($.cron.trim()&&$.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Y={description:$.description.trim(),action:$.action,channel_id:$.channel_id.trim()};if($.cron.trim()&&(Y.cron=$.cron.trim()),$.run_at.trim()){const ue=h.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const H=g.value;if(ue.state==="ambiguous"&&m.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!H){d.value="One-time run time could not be resolved";return}Y.run_at=H.toISOString()}if($.action==="reminder"&&$.message.trim()&&(Y.message=$.message.trim()),$.action==="check"&&($.tool_name.trim()&&(Y.tool_name=$.tool_name.trim()),$.report_format&&(Y.report_format=$.report_format),$.tool_input_str.trim()))try{Y.tool_input=JSON.parse($.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if($.action==="webhook"){if(!$.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:$.webhook_url.trim(),method:$.webhook_method};if($.webhook_headers_str.trim())try{const H=JSON.parse($.webhook_headers_str.trim());if(!H||Array.isArray(H)||typeof H!="object")throw new Error("not an object");ue.headers=H}catch{d.value="Webhook headers must be a valid JSON object";return}if($.webhook_body&&(ue.body=$.webhook_body),$.webhook_expected_status_str.trim()){const H=$.webhook_expected_status_str.split(",").map(te=>Number(te.trim()));if(H.some(te=>!Number.isInteger(te)||te<100||te>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=H}Y.webhook_config=ue}c.value=!0;try{await z.post("/api/schedules",Y),Se.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},O.value=null,o.value=!1,await J()}catch(ue){ne(ue),d.value=ue.message}c.value=!1}async function ve($){if(!p($.action)){Se.error(ho(a.value));return}const Y=$.id;b.value=Y;try{const ue=await z.post(`/api/schedules/${encodeURIComponent(Y)}/run`);if(ue.status==="failure")Se.error(`Execution failed: ${ue.error||"unknown error"}`);else{const H=ue.warning?`Executed (${ue.warning})`:"Executed successfully";Se.success(H)}await J()}catch(ue){ne(ue),Se.error(ue.message||"Failed to trigger")}b.value=null}async function ye($){if($.paused&&!p($.action)){Se.error(ho(a.value));return}k.value=$.id;const Y=!$.paused;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{paused:Y}),Se.success(Y?"Schedule paused":"Schedule resumed"),await J()}catch(ue){ne(ue),Se.error(ue.message||"Failed to update schedule")}k.value=null}const _e=new Map;function $e($,Y){const ue=_e.get($.id);ue&&clearTimeout(ue.timer);const H={run:()=>E($,Y),timer:null};H.timer=setTimeout(()=>{_e.delete($.id),H.run()},500),_e.set($.id,H)}async function E($,Y){A.value=$.id;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{report_format:Y}),Se.success(Y?"Structured report enabled":"Plain-text report enabled")}catch(ue){Se.error(`Update failed: ${ue.message}`)}finally{await J(),A.value=null}}function P(){for(const[$,Y]of[..._e])clearTimeout(Y.timer),_e.delete($),Y.run()}async function V($){C.value=$;try{await z.post(`/api/schedules/${encodeURIComponent($)}/reset-failures`),Se.success("Failure counters reset"),await J()}catch(Y){Se.error(Y.message||"Failed to reset")}C.value=null}async function pe($){const Y=e.value.find(H=>H.id===$);if(await es({title:"Delete schedule",message:`Delete "${(Y==null?void 0:Y.description)||$}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){x.value=$;try{await z.del(`/api/schedules/${encodeURIComponent($)}`),Se.success("Schedule deleted"),await J()}catch(H){Se.error(H.message||"Failed to delete schedule")}x.value=null}}return Qe(()=>{J(),fe(),l=setInterval(fe,lS)}),bt(()=>{P(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:R,runAtAnalysis:h,runAtOccurrence:m,cronResult:O,validatingCron:y,cronPresets:v,runningId:b,deletingId:x,togglingId:k,resettingId:C,reportUpdatingId:A,flushReportFormatTimers:P,expandedId:_,history:I,historyLoading:U,historyError:T,cronCount:Z,oneTimeCount:W,webhookCount:M,pausedCount:L,failingCount:D,formatTs:Gn,formatAge:Uv,formatFuture:le,formatMs:ie,formatDuration:Fi,onCronInput:B,onRunAtInput:Q,validateCron:re,toggleExpand:K,fetchSchedules:J,fetchSchedulingAvailability:fe,doCreate:he,doRunNow:ve,doTogglePause:ye,doUpdateReportFormat:$e,doResetFailures:V,doDelete:pe}}},Vv=[{id:"live",label:"Live",component:Wk},{id:"agents",label:"Agents",component:Xk},{id:"loops",label:"Loops",component:eS},{id:"processes",label:"Processes",component:tS},{id:"schedules",label:"Schedules",component:rS}],cS={components:{TabbedPage:Nr},setup(){return{tabs:Vv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},dS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(h){if(!h)return"";if(typeof h=="string")return h;try{return JSON.stringify(h,null,2)}catch{return String(h)}}function l(h){a.value=a.value===h?null:h}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},m()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await z.get("/api/audit/verify")}catch(h){h.status===409&&h.data&&typeof h.data=="object"?d.value=h.data.availability==="not_enabled"?{...h.data,not_enabled:!0}:h.data:(d.value=null,u.value=h.message||"verification request failed")}c.value=!1}async function m(){const h=++r;t.value=!0,s.value=null,a.value=null;try{const g=new URLSearchParams;n.value.tool&&g.set("tool",n.value.tool),n.value.user&&g.set("user",n.value.user),n.value.keyword&&g.set("q",n.value.keyword),n.value.date&&g.set("date",n.value.date),g.set("limit",String(n.value.limit));const R=g.toString(),O=await z.get(`/api/audit${R?"?"+R:""}`);if(h!==r)return;e.value=Array.isArray(O)?O:[]}catch(g){if(h!==r)return;s.value=g.message}h===r&&(t.value=!1)}return Qe(()=>{m()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:Gn,formatDetail:i,truncateBlock:Bv,toggleExpand:l,clearFilters:o,fetchAudit:m,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},Yp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],uS=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],pS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),m=f("last_active"),h=f(!1),g=Yp,R=uS,O=f([]),y=f(!1),v=f(""),b=f("flat"),x=f(new Set),k=f(""),C=f(""),A=f(""),_=f(null),I=f(!1),U=f(""),T=f(!1);let F=0;jt([k,C,A],()=>{F++,I.value=!1,U.value="",T.value=_.value!==null},{flush:"sync"});function Z(){try{const ae=localStorage.getItem("odin-session-presets");ae&&(O.value=JSON.parse(ae))}catch{}}function W(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const M=j(()=>p.value.trim()!==""||u.value!=="all"),L=j(()=>{let ae=[...e.value];const Oe=Yp.find(ht=>ht.id===u.value),Fe=Oe?Oe.filters:{};if(Fe.source&&(ae=ae.filter(ht=>ht.source===Fe.source)),Fe.minMessages&&(ae=ae.filter(ht=>ht.message_count>=Fe.minMessages)),Fe.hasCompaction&&(ae=ae.filter(ht=>ht.has_summary)),Fe.maxAge!=null){const ht=Date.now()/1e3;ae=ae.filter(xt=>xt.last_active&&ht-xt.last_active<=Fe.maxAge)}if(p.value.trim()){const ht=p.value.toLowerCase().trim();ae=ae.filter(xt=>(xt.channel_id||"").toLowerCase().includes(ht)||(xt.last_user_id||"").toLowerCase().includes(ht)||(xt.source||"").toLowerCase().includes(ht))}const rt=m.value,Zt=h.value?1:-1;return ae.sort((ht,xt)=>{const qt=ht[rt]||0,Es=xt[rt]||0;return(qt-Es)*Zt}),ae}),D=j(()=>{if(!n.value||!n.value.messages)return[];const ae=n.value.messages;if(ae.length===0)return[];const Oe=[];let Fe=[];for(const rt of ae)rt.role==="user"&&Fe.length>0&&(Oe.push(Fe),Fe=[]),Fe.push(rt);return Fe.length>0&&Oe.push(Fe),Oe}),le=j(()=>L.value.length>0&&c.value.size===L.value.length);function ie(ae){const Oe=ae.find(Fe=>Fe.role==="user");if(Oe&&Oe.content){const Fe=Oe.content.slice(0,120);return Fe.length<Oe.content.length?Fe+"...":Fe}return"(no user message)"}function B(ae){const Oe=new Set(x.value);Oe.has(ae)?Oe.delete(ae):Oe.add(ae),x.value=Oe}function Q(ae){u.value=ae}function re(ae){u.value=ae.id,ae.filters.searchQuery!=null&&(p.value=ae.filters.searchQuery),ae.filters.sortBy&&(m.value=ae.filters.sortBy)}function J(){if(!v.value.trim())return;const ae={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:p.value,sortBy:m.value}};O.value=[...O.value,ae],W(),y.value=!1,v.value=""}function fe(ae){O.value=O.value.filter(Oe=>Oe.id!==ae),W(),u.value===ae&&(u.value="all")}function ne(){u.value="all",p.value="",m.value="last_active",h.value=!1}function K(ae){if(!ae)return"—";const Oe=Date.now()/1e3-ae;if(Oe<60)return"just now";if(Oe<3600){const rt=Math.floor(Oe/60);return`${rt} minute${rt!==1?"s":""} ago`}if(Oe<86400){const rt=Math.floor(Oe/3600);return`${rt} hour${rt!==1?"s":""} ago`}const Fe=Math.floor(Oe/86400);return`${Fe} day${Fe!==1?"s":""} ago`}function he(ae){if(!ae)return"";try{return new Date(ae*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ve(ae){if(!ae)return"";try{return new Date(ae*1e3).toLocaleString()}catch{return""}}function ye(ae){return ae==="user"?"bg-gray-900/50 border border-gray-800":ae==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function _e(ae){return ae==="user"?"sess-msg-user":ae==="assistant"?"sess-msg-assistant":"sess-msg-system"}function $e(ae){return ae==="user"?"badge-info":ae==="assistant"?"badge-success":"badge-warning"}function E(ae){return ae==="user"?"sess-dot-user":ae==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(ae){return ae==="user"?"text-cyan-400":ae==="assistant"?"text-indigo-400":"text-gray-500"}function V(ae){return ae?ae.length>2e3?ae.slice(0,2e3)+`
... (truncated)`:ae:""}async function pe(){const ae=k.value.trim();if(!ae)return;const Oe=++F;I.value=!0,U.value="",T.value=_.value!==null;try{let Fe=`/api/sessions/search?q=${encodeURIComponent(ae)}&limit=50`;C.value.trim()&&(Fe+=`&channel_id=${encodeURIComponent(C.value.trim())}`),A.value.trim()&&(Fe+=`&user_id=${encodeURIComponent(A.value.trim())}`);const rt=await z.get(Fe);if(Oe!==F)return;_.value=rt.results||[],T.value=!1}catch(Fe){if(Oe!==F)return;U.value=Fe.message||"Search failed. Please retry."}finally{Oe===F&&(I.value=!1)}}function $(){F++,k.value="",C.value="",A.value="",_.value=null,U.value="",T.value=!1,I.value=!1}function Y(ae){return ae?ae.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(ae){return ae==="user"?"fts-result-user":ae==="assistant"?"fts-result-assistant":ae==="summary"?"fts-result-summary":ae==="fts"?"fts-result-fts":ae==="channel"?"fts-result-channel":"fts-result-default"}function H(ae){return ae==="user"?"badge-info":ae==="assistant"?"badge-success":ae==="summary"?"badge-warning":ae==="fts"?"badge-success":"badge-info"}let te=0;async function X(){const ae=++te;t.value=!0,s.value=null;try{const Oe=await z.get("/api/sessions");if(ae!==te)return;e.value=Oe}catch(Oe){if(ae!==te)return;s.value=Oe.message}ae===te&&(t.value=!1)}function be(){s.value=null,X()}async function ge(ae){if(a.value===ae){a.value=null,n.value=null,x.value=new Set;return}a.value=ae,n.value=null,i.value=!0,x.value=new Set;const Oe=++l;try{const Fe=await z.get(`/api/sessions/${encodeURIComponent(ae)}`);Oe===l&&a.value===ae&&(n.value=Fe)}catch(Fe){Oe===l&&a.value===ae&&(n.value={messages:[],summary:"",error:Fe.message||"Failed to load session"})}finally{Oe===l&&(i.value=!1)}}function me(ae){const Oe=new Set(c.value);Oe.has(ae)?Oe.delete(ae):Oe.add(ae),c.value=Oe}function Te(){le.value?c.value=new Set:c.value=new Set(L.value.map(ae=>ae.channel_id))}function De(ae){o.value=ae}async function je(){if(o.value){r.value=!0;try{await z.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(ae){s.value=ae.message||"Failed to clear session"}r.value=!1,o.value=null}}function ze(){d.value=!0}async function qe(){if(c.value.size!==0){r.value=!0;try{await z.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(ae){s.value=ae.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function We(ae,Oe){const Fe=`/api/sessions/${encodeURIComponent(ae)}/export?format=${Oe}`;try{const rt=await z.getBlob(Fe),Zt=URL.createObjectURL(rt),ht=document.createElement("a");ht.href=Zt,ht.download=`session-${ae}.${Oe==="text"?"txt":"json"}`,ht.click(),URL.revokeObjectURL(Zt)}catch(rt){s.value=rt.message||"Failed to export session"}}let ot=null;function Ke(ae){ae.payload&&ae.payload.channel_id&&(clearTimeout(ot),ot=setTimeout(()=>{if(X(),a.value&&ae.payload.channel_id===a.value){const Oe=a.value,Fe=l;z.get(`/api/sessions/${encodeURIComponent(Oe)}`).then(rt=>{Fe!==l||a.value!==Oe||(n.value=rt)}).catch(()=>{})}},2e3))}let ee=!1,we=null;function Ae(){ee||(ee=!0,X(),lt.subscribe("events",Ke),we=lt.onReconnected(()=>X()))}Qe(()=>{Z(),Ae()}),rs(()=>{Ae()});function Le(){ee&&(ee=!1,lt.unsubscribe("events",Ke),we&&(we(),we=null),clearTimeout(ot))}return Jt(Le),bt(Le),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:le,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:m,sortAsc:h,filterPresets:g,sortOptions:R,filteredSessions:L,hasActiveFilters:M,customPresets:O,showSavePreset:y,newPresetName:v,threadView:b,threads:D,collapsedThreads:x,ftsQuery:k,ftsChannelId:C,ftsUserId:A,ftsResults:_,ftsSearching:I,ftsError:U,ftsStale:T,formatAge:K,formatTimestamp:he,formatFullTimestamp:ve,messageClass:ye,threadMsgClass:_e,roleBadge:$e,roleDotClass:E,roleLabelClass:P,truncateContent:V,threadSummary:ie,fetchSessions:X,retry:be,toggleSession:ge,toggleSelect:me,toggleSelectAll:Te,confirmClear:De,clearSession:je,confirmBulkClear:ze,doBulkClear:qe,exportSession:We,applyPreset:Q,applyCustomPreset:re,saveCustomPreset:J,removeCustomPreset:fe,resetFilters:ne,toggleThread:B,runFtsSearch:pe,clearFtsSearch:$,highlightSnippet:Y,ftsResultClass:ue,ftsTypeBadge:H}}},fS={props:["trace"],template:`
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
  `,setup(){return{formatTokens:zv}}},mS={components:{ContextAssemblyPanel:fS},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(C){if(!C)return"—";try{const A=new Date(C);return isNaN(A.getTime())?C:A.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return C}}function p(C){return!C&&C!==0?"—":C<1e3?C+"ms":(C/1e3).toFixed(1)+"s"}function m(C){return!C&&C!==0?"—":C>=1e3?(C/1e3).toFixed(1)+"k":String(C)}function h(C){if(!C)return"";if(typeof C=="string")return C;try{return JSON.stringify(C,null,2)}catch{return String(C)}}function g(C){n.value===C?n.value=null:(n.value=C,c.value={})}function R(C,A){const _=C+"-"+A;c.value={...c.value,[_]:!c.value[_]}}function O(C,A){return!!c.value[C+"-"+A]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,x()}async function v(){try{const C=await z.get("/api/trajectories");e.value=C.files||[],r.value=C.count||0}catch{}}let b=0;async function x(){const C=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const A=await z.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(C!==b)return;let _=A.entries||[];d.value.tool_name&&(_=_.filter(I=>(I.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(_=_.filter(I=>I.is_error)),d.value.channel_id&&(_=_.filter(I=>I.channel_id===d.value.channel_id)),d.value.user_id&&(_=_.filter(I=>I.user_id===d.value.user_id)),t.value=_}else{const A=new URLSearchParams;d.value.channel_id&&A.set("channel_id",d.value.channel_id),d.value.user_id&&A.set("user_id",d.value.user_id),d.value.tool_name&&A.set("tool_name",d.value.tool_name),d.value.errors_only&&A.set("errors_only","true"),A.set("limit",String(d.value.limit));const _=A.toString(),I=await z.get(`/api/trajectories/search/query?${_}`);if(C!==b)return;t.value=I.results||[]}}catch(A){if(C!==b)return;a.value=A.message}C===b&&(s.value=!1)}async function k(){if(!l.value.trim())return;const C=++b;s.value=!0,a.value=null,c.value={};try{const A=await z.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(C!==b)return;i.value=A.entry||null,i.value||(a.value="No trace found for this message ID")}catch(A){if(C!==b)return;A.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=A.message}C===b&&(s.value=!1)}return Qe(async()=>{await v(),await x()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:m,formatJSON:h,truncateBlock:Bv,toggleExpand:g,toggleIteration:R,isIterationExpanded:O,clearFilters:y,fetchFiles:v,fetchTraces:x,lookupMessage:k}}};function hS(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function vS(e){return e?`${e.approximate?"~":""}${ru(e.total||0)}`:"0"}const gS={template:`
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

        <section class="hm-card mt-4" aria-labelledby="usage-cost-heading">
          <h3 id="usage-cost-heading" class="text-sm font-semibold text-slate-300">Provider-reported actual cost</h3>
          <p class="text-xl text-white mt-2">{{ formatActualCost(data.cost?.actual_spend_usd) }}</p>
          <p class="text-xs text-slate-500 mt-1">{{ data.cost?.note || 'No provider-reported cost in this range.' }}</p>
          <div v-if="(data.upstream_cache || []).length" class="mt-3 space-y-1 text-xs text-slate-400">
            <div v-for="row in data.upstream_cache" :key="row.model + ':' + row.upstream_provider">
              {{ row.model }} via {{ row.upstream_provider }} · {{ row.cached_percent }}% cached · {{ fmtNum(row.samples) }} measured generations
            </div>
          </div>
        </section>
      </div>
    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=j(()=>a.value.work||{}),m=C=>C==null?"Not reported":`$${Number(C).toFixed(6)}`,h=j(()=>Math.max(1,...(a.value.activity_over_time||[]).map(C=>Number(C.count||0)))),g=j(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),R=C=>({height:`${Math.max(4,Math.round(Number(C||0)/h.value*100))}%`}),O=j(()=>s.value&&l.value-i.value>3e4);async function y(){const C=++d,A=n.value;try{const _=await z.get(`/api/usage?range=${encodeURIComponent(A)}`);if(C!==d||A!==n.value)return;a.value=_,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(_){C===d&&(t.value=_.message)}finally{C===d&&(e.value=!1)}}function v(C){n.value=C,e.value=!s.value,y()}function b(){e.value=!0,y()}function x(){c||(c=!0,y(),o=setInterval(y,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function k(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Qe(x),rs(x),Jt(k),bt(k),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:O,fmtNum:ru,fmtDuration:hS,tokenLabel:vS,formatActualCost:m,activityTrackStyle:g,activityBar:R,selectRange:v,retry:b}}},qv=[{id:"audit",label:"Audit",component:dS},{id:"sessions",label:"Sessions",component:pS},{id:"traces",label:"Traces",component:mS},{id:"usage",label:"Usage & Activity",component:gS}],bS={components:{TabbedPage:Nr},setup(){return{tabs:qv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},dc=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(_){return _.source!=="builtin"?"":u[_.state]||""}function m(_,I){const U=_&&Array.isArray(_.tools)?_.tools:null;if(c.value=!!U,r.value=U?!!_.global_enabled:null,!U){e.value=I.map(Z=>({...Z,source:"unknown",enabled:void 0,state:null}));return}const T=new Set(U.map(Z=>Z.name)),F=I.filter(Z=>!T.has(Z.name)).map(Z=>({...Z,source:Z.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...U.map(Z=>({...Z,source:"builtin"})),...F]}async function h(_,I){if(d.value.has(_.name))return;const U=!!I.target.checked,T=new Set(d.value);T.add(_.name),d.value=T;try{const F=await z.post(`/api/tools/builtins/${encodeURIComponent(_.name)}/enabled`,{enabled:U});m(F,e.value),s.value=null;try{const Z=await z.get("/api/tools");m(F,Z)}catch(Z){console.warn("Built-in toggle committed; visible catalog refresh failed",Z)}}catch(F){I.target.checked=!!_.enabled,s.value=F.message||`Failed to toggle ${_.name}`}finally{const F=new Set(d.value);F.delete(_.name),d.value=F}}const g=j(()=>e.value.filter(_=>_.source==="builtin"&&_.is_core).length),R=j(()=>e.value.filter(_=>_.source==="skill").length),O=j(()=>Object.values(n.value).reduce((_,I)=>_+I,0));function y(_){for(const I of dc)if(I.id!=="other"&&I.match(_))return I.id;return"other"}const v=j(()=>{let _=e.value;if(a.value){const I=a.value.toLowerCase();_=_.filter(U=>U.name.toLowerCase().includes(I)||(U.description||"").toLowerCase().includes(I))}return o.value&&(_=_.filter(I=>y(I.name)===o.value)),_}),b=j(()=>{const _=new Set;for(const I of e.value)_.add(y(I.name));return dc.filter(I=>_.has(I.id))}),x=j(()=>{const _=v.value,I={};for(const T of _){const F=y(T.name);I[F]||(I[F]=[]),I[F].push(T)}const U=[];for(const T of dc)I[T.id]&&I[T.id].length>0&&U.push({label:T.label,icon:T.icon,tools:I[T.id].sort((F,Z)=>F.name.localeCompare(Z.name))});return U});function k(_){i.value={...i.value,[_]:!i.value[_]}}async function C(){t.value=!0,s.value=null;try{const[_,I,U]=await Promise.all([z.get("/api/tools"),z.get("/api/tools/stats").catch(()=>({})),z.get("/api/tools/builtins").catch(()=>null)]);m(U,_),n.value=I||{}}catch(_){s.value=_.message}t.value=!1}function A(){C()}return Qe(()=>{C()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:g,skillCount:R,totalUsage:O,filteredTools:v,groupedTools:x,usedCategories:b,stateBadge:p,applyInventory:m,toggleBuiltinTool:h,truncate:ou,toggleExpand:k,refresh:A}}};function xS(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _S(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const wS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),m=f(null),h=f(!1),g=f(null),R=f(null),O=f(!1),y=j(()=>e.value.length),v=j(()=>e.value.reduce((J,fe)=>J+(fe.execution_count||0),0)),b=j(()=>e.value.reduce((J,fe)=>J+I(fe.code),0)),x=j(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(J)||(fe.description||"").toLowerCase().includes(J))}),k=j(()=>u.value?u.value.split(`
`).length:0),C=j(()=>{const J=Math.max(k.value,1);return Array.from({length:J},(fe,ne)=>ne+1).join(`
`)}),A=j(()=>{const J=u.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function _(J){return xS(J)}function I(J){return J?J.split(`
`).length:0}function U(J){return _S(J)}function T(J){a.value={...a.value,[J]:!a.value[J]}}async function F(J){try{await navigator.clipboard.writeText(J);const fe=e.value.find(ne=>ne.code===J);fe&&(o.value=fe.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Z(J){if(J.key==="Tab"){J.preventDefault();const fe=J.target,ne=fe.selectionStart,K=fe.selectionEnd;u.value=u.value.substring(0,ne)+"    "+u.value.substring(K),Pt(()=>{fe.selectionStart=fe.selectionEnd=ne+4})}}function W(J){const fe=J.target.previousElementSibling;fe&&(fe.scrollTop=J.target.scrollTop)}async function M(){t.value=!0,s.value=null;try{e.value=await z.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function L(J){i.value=J,delete n.value[J],n.value={...n.value};try{const fe=await z.post(`/api/skills/${encodeURIComponent(J)}/test`);n.value={...n.value,[J]:fe}}catch(fe){n.value={...n.value,[J]:{result:fe.message,is_error:!0}}}i.value=null}function D(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,m.value=null}function le(J){r.value=!0,c.value="edit",d.value=J.name,u.value=J.code||"",p.value=null,m.value=null}function ie(){r.value=!1,p.value=null,m.value=null}async function B(){p.value=null,m.value=null;const J=d.value.trim(),fe=u.value.trim();if(!J){p.value="Name is required";return}if(!fe){p.value="Code is required";return}h.value=!0;try{c.value==="create"?(await z.post("/api/skills",{name:J,code:fe}),m.value="Skill created successfully"):(await z.put(`/api/skills/${encodeURIComponent(J)}`,{code:fe}),m.value="Skill updated successfully"),await M(),setTimeout(()=>{r.value=!1},800)}catch(ne){p.value=ne.message}h.value=!1}function Q(J){R.value=J}async function re(){if(R.value){O.value=!0;try{await z.del(`/api/skills/${encodeURIComponent(R.value)}`),await M()}catch(J){Se.error(`Failed to delete skill: ${J.message||"unknown error"}`)}O.value=!1,R.value=null}}return Qe(()=>{M()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:m,saving:h,editorRef:g,deleteTarget:R,deleting:O,enabledCount:y,totalExecutions:v,totalLines:b,displayedSkills:x,editLineCount:k,editorLineNums:C,editValidation:A,highlight:_,truncate:ou,formatTs:Gn,countLines:I,getLineNumbers:U,toggleCode:T,copyCode:F,handleEditorKey:Z,syncScroll:W,fetchSkills:M,testSkill:L,showCreate:D,editSkill:le,cancelEdit:ie,saveSkill:B,confirmDelete:Q,doDelete:re}}};class Zs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const kS=/^[A-Za-z_][A-Za-z0-9_]*$/;function Qp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Xp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Zs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Zs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new Zs(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Zs(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function SS(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function TS(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new Zs("Server name is required.","name");if(n.length>128||!kS.test(n))throw new Zs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new Zs("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=Qp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Zs("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new Zs("An HTTP endpoint is required for this connection.","url");if(d&&!SS(d))throw new Zs("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Zs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=Qp(e.allowlistText));const r=Xp(e.headerRows,e.headersRemove,"Header"),c=Xp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function CS(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function ES(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function AS(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const RS=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function IS(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const OS=1e4,LS=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function uc(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function NS(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const MS={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=j(()=>Object.keys(i.value).every(ee=>{var we;return Number.isInteger((we=e.value)==null?void 0:we[ee])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),m=f({}),h=f(new Set),g=f(!1),R=f("add"),O=f(""),y=f(null),v=f(uc()),b=f(""),x=f(!1);let k=null,C=0,A=!1,_=!1;const I=RS,U=j(()=>{var ee;return((ee=e.value)==null?void 0:ee.servers)||[]}),T=j(()=>{var ee;return!!((ee=e.value)!=null&&ee.enabled)}),F=j(()=>{var ee,we,Ae,Le;return{serverCount:((ee=e.value)==null?void 0:ee.server_count)||0,enabledCount:((we=e.value)==null?void 0:we.enabled_server_count)||0,connectedCount:((Ae=e.value)==null?void 0:Ae.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),Z=j(()=>{var ee;return((ee=y.value)==null?void 0:ee.header_keys)||[]}),W=j(()=>{var ee;return((ee=y.value)==null?void 0:ee.env_keys)||[]}),M=j(()=>{var ee;return R.value==="edit"&&((ee=y.value)==null?void 0:ee.transport)==="http"}),L=j(()=>R.value==="add"||!M.value),D=j(()=>M.value?"Replace endpoint URL":"Endpoint URL"),le=j(()=>M.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function ie(){B(),k=window.setInterval(()=>Q({quiet:!0}),OS)}function B(){k&&window.clearInterval(k),k=null}async function Q({quiet:ee=!1}={}){if(a.value)return;const we=++C;ee||(t.value=!0);try{const Ae=await z.get("/api/mcp/status");if(we!==C||!A)return;e.value=Ae;for(const ae of Object.keys(i.value))!l.value.has(ae)&&Number.isInteger(Ae[ae])&&(i.value[ae]=String(Ae[ae]));r.value="";const Le=new Set((Ae.servers||[]).map(ae=>ae.name));d.value=new Set([...d.value].filter(ae=>Le.has(ae)))}catch(Ae){we===C&&A&&(r.value=Ae.message||"Failed to load MCP status")}finally{we===C&&(t.value=!1)}}function re(ee){return s.value||c.value.has(ee)}function J(ee,we){const Ae=new Set(c.value);we?Ae.add(ee):Ae.delete(ee),c.value=Ae}function fe(ee){return ES(ee.state)}function ne(ee){if(fe(ee)==="disabled"){if(!ee.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return LS[fe(ee)]}function K(ee){return ee.transport==="http"?"Streamable HTTP":"stdio"}function he(ee){return ee.negotiated_version?`${ee.era?`${String(ee.era).charAt(0).toUpperCase()}${String(ee.era).slice(1)}`:"Protocol"} · ${ee.negotiated_version}`:"Not negotiated"}function ve(ee){return ee.discovered_count?`${ee.published_count||0} published · ${ee.excluded_count||0} excluded`:"No tools discovered"}const ye=f(new Set);async function _e(ee,we){if(ye.value.has(ee.name))return;const Ae=!!we.target.checked,Le=new Set(ye.value);Le.add(ee.name),ye.value=Le;try{const ae=await z.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/enabled`,{enabled:Ae});ae&&Array.isArray(ae.servers)?e.value=ae:await Q({quiet:!0})}catch(ae){we.target.checked=!!ee.enabled,Se.error(ae.message||`Failed to toggle ${ee.name}`)}finally{const ae=new Set(ye.value);ae.delete(ee.name),ye.value=ae}}function $e(ee,we){var Le;i.value[ee]=we;const Ae=new Set(l.value);we===String((Le=e.value)==null?void 0:Le[ee])?Ae.delete(ee):Ae.add(ee),l.value=Ae,n.value=""}async function E(){if(s.value||!o.value||!l.value.size)return;const ee={};for(const we of l.value){const Ae=Number(i.value[we]),Le=we==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ae)||Ae<1||Ae>Le){n.value=`Enter a whole number between 1 and ${Le}.`;return}ee[we]=Ae}a.value=!0,s.value=!0,n.value="",++C,t.value=!1;try{const we=await z.post("/api/mcp/limits",ee);e.value=we;for(const Ae of Object.keys(i.value))Number.isInteger(we[Ae])&&(i.value[Ae]=String(we[Ae]));l.value=new Set,Se.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(we){n.value=we.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Q({quiet:!0})}}async function P(ee){if(ee!==T.value&&!(!ee&&!await es({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await z.post("/api/mcp/enabled",{enabled:ee}),Se.success(ee?"MCP enabled":"MCP disabled"),await Q({quiet:!0})}catch(we){Se.error(we.message||"Failed to update MCP state"),await Q({quiet:!0})}finally{s.value=!1}}}async function V(ee){J(ee.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/reconnect`,{}),Se.success(`Reconnected ${ee.name}`)}catch(we){Se.error(we.message||`Failed to reconnect ${ee.name}`)}finally{J(ee.name,!1),await Q({quiet:!0})}}async function pe(ee){J(ee.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/refresh-tools`,{}),Se.success(`Refreshed tools from ${ee.name}`),await ue(ee.name,!0)}catch(we){Se.error(we.message||`Failed to refresh ${ee.name}`)}finally{J(ee.name,!1),await Q({quiet:!0})}}async function $(ee){if(await es({title:`Remove ${ee.name}`,message:`Remove this saved MCP server? Its ${ee.published_count||0} published tool${ee.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){J(ee.name,!0);try{await z.del(`/api/mcp/servers/${encodeURIComponent(ee.name)}`),Se.success(`Removed ${ee.name}`),delete p.value[ee.name]}catch(Ae){Se.error(Ae.message||`Failed to remove ${ee.name}`)}finally{J(ee.name,!1),await Q({quiet:!0})}}}async function Y(ee){const we=new Set(d.value);if(we.has(ee.name)){we.delete(ee.name),d.value=we;return}we.add(ee.name),d.value=we,Object.hasOwn(p.value,ee.name)||await ue(ee.name)}async function ue(ee,we=!1){if(!we&&Object.hasOwn(p.value,ee))return;const Ae=new Set(h.value);Ae.add(ee),h.value=Ae,m.value={...m.value,[ee]:""};try{const Le=await z.get(`/api/mcp/servers/${encodeURIComponent(ee)}/tools`);p.value={...p.value,[ee]:Le.tools||[]}}catch(Le){m.value={...m.value,[ee]:Le.message||"Failed to load tools"}}finally{const Le=new Set(h.value);Le.delete(ee),h.value=Le}}function H(ee){return(p.value[ee]||[]).filter(we=>AS(we,u.value[ee]))}function te(ee,we){u.value={...u.value,[ee]:we}}function X(){R.value="add",O.value="",y.value=null,v.value=uc(),b.value="",g.value=!0}function be(ee){R.value="edit",O.value=ee.name,y.value=ee,v.value={...uc(),name:ee.name,enabled:!!ee.enabled,transport:ee.transport||"stdio"},b.value="",g.value=!0}function ge(){x.value||(g.value=!1)}function me(ee){g.value&&IS(ee)}function Te(ee){const we=ee==="headers"?"headerRows":"envRows";v.value[we].push({key:"",value:""})}function De(ee,we){const Ae=ee==="headers"?"headerRows":"envRows";v.value[Ae].splice(we,1)}function je(ee,we){const Ae=ee==="headers"?"headersRemove":"envRemove",Le=v.value[Ae];v.value[Ae]=Le.includes(we)?Le.filter(ae=>ae!==we):[...Le,we]}async function ze(){var we,Ae;b.value="";let ee;try{ee=TS(v.value,{mode:R.value,originalTransport:((we=y.value)==null?void 0:we.transport)||""})}catch(Le){b.value=Le instanceof Zs?Le.message:"Invalid MCP server configuration",await Pt(),(Ae=document.querySelector(".mcp-editor"))==null||Ae.scrollTo({top:0,behavior:"smooth"});return}if(!(R.value==="edit"&&CS(ee,y.value)&&!await es({title:`Change ${O.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){x.value=!0;try{R.value==="add"?await z.post("/api/mcp/servers",ee):await z.put(`/api/mcp/servers/${encodeURIComponent(O.value)}`,ee),Se.success(R.value==="add"?`Saved ${ee.name}`:`Updated ${O.value}`),g.value=!1,await Q({quiet:!0})}catch(Le){b.value=Le.message||"Failed to save MCP server"}finally{x.value=!1}}}let qe=null;function We(ee){`${(ee==null?void 0:ee.event)||""} ${(ee==null?void 0:ee.type)||""} ${(ee==null?void 0:ee.tool)||""} ${(ee==null?void 0:ee.message)||""}`.toLowerCase().includes("mcp")&&(qe&&window.clearTimeout(qe),qe=window.setTimeout(()=>Q({quiet:!0}),200))}function ot(){A||(A=!0,_||(lt.subscribe("events",We),_=!0),Q(),ie())}function Ke(){A=!1,B(),qe&&window.clearTimeout(qe),qe=null,_&&(lt.unsubscribe("events",We),_=!1)}return Qe(ot),rs(ot),Jt(Ke),bt(Ke),{status:e,loading:t,mutating:s,pageError:r,servers:U,masterEnabled:T,aggregate:F,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:$e,saveLimits:E,expandedServers:d,toolQueries:u,toolErrors:m,toolsLoading:h,editorOpen:g,editorMode:R,editingName:O,editingServer:y,form:v,formError:b,saving:x,editorGroups:I,configuredHeaderKeys:Z,configuredEnvKeys:W,savedHttpEndpoint:M,endpointRequired:L,endpointFieldLabel:D,endpointPlaceholder:le,refreshAll:Q,busy:re,serverState:fe,stateLabel:ne,transportLabel:K,protocolLabel:he,toolSummary:ve,formatAge:NS,setMasterEnabled:P,togglePending:ye,toggleServerEnabled:_e,reconnect:V,refreshTools:pe,removeServer:$,toggleTools:Y,filteredTools:H,setToolQuery:te,openAdd:X,openEdit:be,closeEditor:ge,jumpToEditorGroup:me,addSecretRow:Te,removeSecretRow:De,toggleSecretRemoval:je,saveServer:ze}}};function DS(e,t){if(!e||!t)return Wp(e);const s=Wp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const PS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),m=f(!1),h=f(null),g=f(null);let R=null;const O=f(null),y=f(!1),v=f({}),b=f({}),x=f({}),k=f({}),C=new Map,A=f(null),_=j(()=>e.value.reduce((B,Q)=>B+(Q.chunks||0),0)),I=j(()=>new Set(e.value.map(Q=>Q.uploader).filter(Boolean)).size);function U(B,Q){const re=b.value[Q];if(!re||re.length===0)return 0;const J=Math.max(...re.map(fe=>fe.char_count||0));return J===0?0:Math.round(B.char_count/J*100)}async function T(){t.value=!0,s.value=null;try{const B=await z.get("/api/knowledge");e.value=Array.isArray(B)?B:[]}catch(B){s.value=B.message}t.value=!1}async function F(B){if(v.value[B]){v.value[B]=!1,A.value=null;return}if(v.value[B]=!0,Object.prototype.hasOwnProperty.call(b.value,B))return;if(C.has(B))return C.get(B);const Q={...k.value,[B]:!0};k.value=Q;const re={...x.value};delete re[B],x.value=re;const J=z.get(`/api/knowledge/${encodeURIComponent(B)}/chunks`).then(fe=>{b.value={...b.value,[B]:Array.isArray(fe)?fe:[]}}).catch(fe=>{x.value={...x.value,[B]:fe.message||"load failed"}}).finally(()=>{if(C.get(B)!==J)return;C.delete(B);const fe={...k.value};delete fe[B],k.value=fe});return C.set(B,J),J}let Z=0;async function W(){const B=a.value.trim();if(!B)return;const Q=++Z;i.value=!0,o.value=null,l.value=B;try{const re=await z.get(`/api/knowledge/search?q=${encodeURIComponent(B)}`);if(Q!==Z)return;n.value=Array.isArray(re)?re:[]}catch(re){if(Q!==Z)return;n.value=[],o.value=re.message||"Search failed"}Q===Z&&(i.value=!1)}function M(){Z+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function L(){u.value=null,p.value=null;const B=c.value.trim(),Q=d.value.trim();if(!B){u.value="Source name is required";return}if(!Q){u.value="Content is required";return}m.value=!0;try{const re=await z.post("/api/knowledge",{source:B,content:Q});p.value=`Ingested ${re.chunks||0} chunks from "${B}"`,c.value="",d.value="",b.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}m.value=!1}async function D(B){h.value=B,g.value=null,R&&(clearTimeout(R),R=null);try{const Q=await z.post(`/api/knowledge/${encodeURIComponent(B)}/reingest`);g.value={source:B,error:!1,message:`Re-ingested ${Q.chunks||0} chunks`},delete b.value[B],await T(),R=setTimeout(()=>{g.value=null,R=null},3e3)}catch(Q){g.value={source:B,error:!0,message:Q.message}}h.value=null}function le(B){O.value=B}async function ie(){if(O.value){y.value=!0;try{await z.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete b.value[O.value],await T()}catch(B){Se.error(`Failed to delete source: ${B.message||"unknown error"}`)}y.value=!1,O.value=null}}return Qe(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:m,reingesting:h,reingestResult:g,deleteTarget:O,deleting:y,expanded:v,sourceChunks:b,chunkErrors:x,loadingChunks:k,selectedChunk:A,totalChunks:_,uploaderCount:I,truncate:ou,formatTs:Gn,highlightTerms:DS,chunkBarWidth:U,fetchSources:T,toggleSource:F,doSearch:W,clearSearch:M,doIngest:L,doReingest:D,confirmDelete:le,doDelete:ie}}},FS={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),m=f(""),h=f(!1),g=f(null),R=f(null),O=f(new Set),y=f(null),v=f(!1),b=f(!1),x=j(()=>e.value.reduce((Q,re)=>Q+re.count,0)),k=j(()=>O.value.size);function C(Q){const re=t.value[Q];if(!re)return[];if(!l.value.trim())return re;const J=l.value.trim().toLowerCase();return re.filter(fe=>fe.key.toLowerCase().includes(J)||fe.value&&fe.value.toLowerCase().includes(J))}function A(Q,re){return O.value.has(Q+"/"+re)}function _(Q,re){const J=Q+"/"+re,fe=new Set(O.value);fe.has(J)?fe.delete(J):fe.add(J),O.value=fe}function I(Q){const re=t.value[Q];return!re||re.length===0?!1:re.every(J=>O.value.has(Q+"/"+J.key))}function U(Q,re){const J=t.value[Q];if(!J)return;const fe=new Set(O.value);for(const ne of J){const K=Q+"/"+ne.key;re?fe.add(K):fe.delete(K)}O.value=fe}async function T(){s.value=!0,a.value=null;try{const Q=await z.get("/api/memory");e.value=Object.entries(Q).map(([re,J])=>({name:re,keys:J.keys||[],count:J.count||0}))}catch(Q){a.value=Q.message}s.value=!1}async function F(Q){if(n.value[Q]){n.value[Q]=!1;return}n.value[Q]=!0;const re=e.value.find(fe=>fe.name===Q);if(!re||t.value[Q]||i.value===Q)return;i.value=Q;let J;try{const ne=(await z.get(`/api/memory/${encodeURIComponent(Q)}`)).entries||{};J=re.keys.map(K=>Object.prototype.hasOwnProperty.call(ne,K)?{key:K,value:ne[K]||"",failed:!1}:{key:K,value:"",failed:!0,error:"Not found in scope"})}catch(fe){J=re.keys.map(ne=>({key:ne,value:"",failed:!0,error:fe.message||"Failed to load"}))}t.value[Q]=J,i.value=null}function Z(Q,re,J){p.value=Q+"/"+re,m.value=J}async function W(Q,re){h.value=!0,g.value=null;try{await z.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(re)}`,{value:m.value});const J=t.value[Q];if(J){const fe=J.find(ne=>ne.key===re);fe&&(fe.value=m.value)}p.value=null}catch(J){g.value=`Failed to save: ${J.message||"unknown error"}`}h.value=!1}async function M(Q,re){try{await navigator.clipboard.writeText(re.value),R.value=Q+"/"+re.key,setTimeout(()=>{R.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const Q=r.value.scope.trim(),re=r.value.key.trim(),J=r.value.value.trim();if(!Q){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!J){d.value="Value is required";return}c.value=!0;try{await z.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(re)}`,{value:J}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function D(Q,re){y.value={scope:Q,key:re}}async function le(){if(!y.value)return;v.value=!0,g.value=null;const{scope:Q,key:re}=y.value;try{await z.del(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(re)}`);const J=t.value[Q];J&&(t.value[Q]=J.filter(K=>K.key!==re));const fe=e.value.find(K=>K.name===Q);fe&&(fe.count--,fe.keys=fe.keys.filter(K=>K!==re));const ne=new Set(O.value);ne.delete(Q+"/"+re),O.value=ne}catch(J){g.value=`Failed to delete: ${J.message||"unknown error"}`}v.value=!1,y.value=null}function ie(){b.value=!0}async function B(){v.value=!0,g.value=null;const Q=[];for(const re of O.value){const J=re.indexOf("/");Q.push({scope:re.slice(0,J),key:re.slice(J+1)})}try{await z.post("/api/memory/bulk-delete",{entries:Q}),O.value=new Set,t.value={},await T()}catch(re){g.value=`Bulk delete failed: ${re.message||"unknown error"}`}v.value=!1,b.value=!1}return Qe(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:m,saving:h,actionError:g,copied:R,selected:O,selectedCount:k,totalEntries:x,deleteTarget:y,deleting:v,showBulkDelete:b,fetchMemory:T,toggleScope:F,startEdit:Z,doEdit:W,copyValue:M,doAdd:L,confirmDelete:D,doDelete:le,confirmBulkDelete:ie,doBulkDelete:B,isSelected:A,toggleSelect:_,isScopeAllSelected:I,toggleSelectAll:U,filteredEntries:C}}},$S={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=j(()=>[...new Set(e.value.map(k=>k.category))].sort()),p=j(()=>{const x={};return e.value.forEach(k=>{x[k.category]=(x[k.category]||0)+1}),x}),m=j(()=>n.value?e.value.filter(x=>x.category===n.value):e.value);function h(x){return x==="correction"?"badge-warning":x==="operational"?"badge-info":x==="preference"?"badge-success":"badge-info"}function g(x){i.value=x.key,l.value=x.content}async function R(x){try{await z.put("/api/learned/"+encodeURIComponent(x),{content:l.value}),i.value=null,Se.success("Entry updated"),await y()}catch(k){Se.error(k.message||"Failed to save entry")}}async function O(x){if(await es({title:"Delete learned entry",message:`Delete "${x}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/learned/"+encodeURIComponent(x)),Se.success("Entry deleted"),await y()}catch(C){Se.error(C.message||"Failed to delete entry")}}async function y(){s.value=!0,a.value=null;try{const x=await z.get("/api/learned");e.value=x.entries||[],t.value={last_reflection:x.last_reflection,count:x.count}}catch(x){a.value=x.message}s.value=!1}async function v(){var x;r.value=!1,c.value=null;try{const k=await z.get("/api/config");o.value=((x=k.learning)==null?void 0:x.enabled)===!0,r.value=!0}catch(k){c.value=k.status===403?"Administrator access is required to change automatic learning.":k.message||"Automatic learning state is unavailable."}}async function b(x){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await z.put("/api/config",{learning:{enabled:x}}),await v(),!r.value)return;Se.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(k){r.value=!1,c.value=k.status===403?"Administrator access is required to change automatic learning.":k.message||"Failed to change automatic learning."}finally{d.value=!1}}}return Qe(()=>{y(),v()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:m,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:h,formatTs:Gn,startEdit:g,saveEdit:R,deleteEntry:O,fetchEntries:y,fetchLearningConfig:v,setLearningEnabled:b}}},Gv=[{id:"tools",label:"Tools",component:yS},{id:"skills",label:"Skills",component:wS},{id:"mcp-servers",label:"MCP Servers",component:MS},{id:"knowledge",label:"Knowledge",component:PS},{id:"memory",label:"Memory",component:FS},{id:"learned",label:"Learned",component:$S}],US={components:{TabbedPage:Nr},setup(){return{tabs:Gv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},BS={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},zS={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},HS={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},jS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=j(()=>e.value.components||[]),l=j(()=>HS[e.value.overall]||"text-gray-400"),o=j(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=j(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return BS[k]||"text-gray-400"}function d(k){return zS[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function m(k){return k.replace(/_/g," ").replace(/\b\w/g,C=>C.toUpperCase())}function h(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function g(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function R(){n.value=!0;try{e.value=await z.get("/api/health/components"),s.value=null,a.value=!0}catch(k){s.value=k.message}finally{t.value=!1,n.value=!1}}function O(){t.value=!0,s.value=null,R()}let y=null,v=!1;function b(){v||(v=!0,R(),y||(y=setInterval(R,3e4)))}function x(){v&&(v=!1,y&&(clearInterval(y),y=null))}return Qe(b),rs(b),Jt(x),bt(x),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:m,formatTime:h,formatNumber:g,fetchHealth:R,retry:O}}},VS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=j(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=j(()=>{if(!i.value)return[];const R=i.value,O=R.storage_total_bytes||1;return[{label:"Session Persistence",mb:R.sessions.persist_dir.total_mb,bytes:R.sessions.persist_dir.total_bytes,files:R.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(R.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:R.knowledge.db_file.total_mb,bytes:R.knowledge.db_file.total_bytes,files:R.knowledge.db_file.file_count,pct:Math.min(100,Math.round(R.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:R.trajectories.message_dir.total_mb,bytes:R.trajectories.message_dir.total_bytes,files:R.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:R.trajectories.agent_dir.total_mb,bytes:R.trajectories.agent_dir.total_bytes,files:R.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const R=await z.get("/api/resource-usage");i.value=R,t.value=null,s.value=!0}catch(R){t.value=R.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let m=!1;function h(){m||(m=!0,d(),l||(l=setInterval(d,3e4)))}function g(){m&&(m=!1,l&&(clearInterval(l),l=null))}return Qe(h),rs(h),Jt(g),bt(g),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:ru,refresh:u,retry:p}}},qS=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),GS=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function WS(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!GS.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?Ul(t):""}function KS(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!qS.has(c)));s=Object.keys(r).length?Ul(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const hn=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Bl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function JS(e){const t=hn(e)?e:{},s=hn(t.metadata)?t.metadata:{},a=hn(t.audit_metadata)?t.audit_metadata:{},n=hn(t.turn)?t.turn:{},i=l=>Bl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function ef(e){return e.record?JSON.stringify(Wv(e),null,2):e.text}function Wv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Xc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function tf(e){if(!Xc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,Bl(s.channel_id),Bl(s.user_id??s.actor)])}function ZS(e,t,s=2e3){var i,l,o;const a=tf(t),n=a?e.findIndex(r=>tf(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Xc(y)==="end"?1:0,p=[...c].sort((y,v)=>u(y)-u(v)),m=Object.assign({},...p);m.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const v=p.filter(b=>hn(b[y])).map(b=>b[y]);v.length&&(m[y]=Object.assign({},...v))}const h=c.some(y=>Xc(y)!=="start"),g=c.find(y=>ed(y,0).level==="ERROR"),R=(g==null?void 0:g.status)||((i=g==null?void 0:g.metadata)==null?void 0:i.status);m.status=g?["failed","error","cancelled","denied","outcome_unknown"].includes(R)?R:"failed":h?m.status||((l=m.metadata)==null?void 0:l.status)||"succeeded":"started",h&&m.status==="started"&&(m.status="succeeded"),g&&(m.error=g.error||((o=g.metadata)==null?void 0:o.error)||m.error);const O=ed(m,r.id,r._time);Object.assign(O,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,O)}e.length>s&&e.splice(0,e.length-s)}function ed(e,t,s=new Date){var u,p;let a=e;if(hn(e)&&e.type==="log"&&"line"in e?a=e.line:hn(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=hn(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(m=>["failed","error","cancelled","denied","outcome_unknown"].includes(m))?"ERROR":Bl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:Bl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:JS(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function YS(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const QS={components:{ToolOutput:Mr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=j(()=>KS(e.entry)),s=j(()=>{var o;return Ul(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=j(()=>{var o,r,c;return Ul(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=j(()=>WS(e.entry.record)),i=j(()=>Wv(e.entry)),l=j(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},XS=["INFO","WARNING","ERROR"],e1=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],pc=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],t1=[50,100,200,500],s1={components:{ToolOutput:Mr,LogRecord:QS},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(lt.state||"disconnected"),u=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),m=f(!1),h=f(null),g=2e3,R=XS,O=e1,y=pc,v=f("all"),b=f(""),x=f([]),k=f(!1),C=f(""),A=f([]);function _(){try{const ce=localStorage.getItem("odin-log-presets");ce&&(x.value=JSON.parse(ce))}catch{}}function I(){try{localStorage.setItem("odin-log-presets",JSON.stringify(x.value))}catch{}}const U=j(()=>l.value!==""||o.value.trim()!==""||b.value!==""),T=j(()=>{const ce=pc.find(Re=>Re.value===b.value);return ce?ce.label:""}),F=j(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ce){return ce.message}}),Z=24,W=j(()=>{if(Q.value.length===0)return[];const ce=[],Re=new Date,Je=3600*1e3;for(let nt=Z-1;nt>=0;nt--){const It=new Date(Re.getTime()-(nt+1)*Je),yt=new Date(Re.getTime()-nt*Je);ce.push({start:It,end:yt,label:le(It,yt),shortLabel:yt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const nt of Q.value){if(!nt._time)continue;const It=nt._time.getTime();for(const yt of ce)if(It>=yt.start.getTime()&&It<yt.end.getTime()){yt.total++,nt.level==="ERROR"?yt.errors++:nt.level==="WARNING"?yt.warnings++:yt.info++;break}}return ce}),M=j(()=>{let ce=1;for(const Re of W.value)Re.total>ce&&(ce=Re.total);return ce}),L=j(()=>{if(W.value.length===0)return"";const ce=Q.value.map(nt=>nt._time&&nt._time.getTime()).filter(Boolean);if(ce.length===0)return"";const Re=new Date(Math.min(...ce));return`${Q.value.length} shown, oldest ${Re.toLocaleTimeString()}`}),D=j(()=>Math.ceil(Z/8));function le(ce,Re){const Je={hour:"2-digit",minute:"2-digit"};return ce.toLocaleTimeString([],Je)+" - "+Re.toLocaleTimeString([],Je)}function ie(ce,Re){return!Re||!ce?"0px":Math.max(2,ce/Re*100)+"%"}function B(ce){const Re=Q.value.findIndex(Je=>Je._time&&Je._time.getTime()>=ce.start.getTime()&&Je._time.getTime()<ce.end.getTime());if(Re>=0&&p.value){const Je=p.value.querySelector('[data-log-id="'+Q.value[Re].id+'"]');Je&&(Je.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Q=j(()=>{let ce=t.value;if(l.value&&(ce=ce.filter(Re=>(Re.level||"INFO")===l.value)),b.value){const Re=pc.find(Je=>Je.value===b.value);if(Re&&Re.seconds){const Je=new Date(Date.now()-Re.seconds*1e3);ce=ce.filter(nt=>nt._time&&nt._time>=Je)}}if(o.value&&!F.value)if(r.value)try{const Re=new RegExp(o.value,"i");ce=ce.filter(Je=>{const nt=Je.searchText,It=Je.tool||"";return Re.test(nt)||Re.test(It)})}catch{}else{const Re=o.value.toLowerCase();ce=ce.filter(Je=>{const nt=Je.searchText.toLowerCase(),It=(Je.tool||"").toLowerCase();return nt.includes(Re)||It.includes(Re)})}return ce}),re=j(()=>YS(Q.value));function J(ce){const Re=ed(ce,++s);if(n.value){A.value.push(Re);return}fe(Re)}function fe(ce){ZS(t.value,ce,g),i.value&&Pt(()=>ne())}function ne(ce=!1){const Re=p.value;Re&&Re.scrollTo({top:Re.scrollHeight,behavior:ce?"smooth":"instant"})}function K(){i.value=!0,m.value=!1,Pt(()=>ne(!0))}const he=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function ve(){const ce=p.value;if(!ce)return;const Re=ce.scrollHeight-ce.scrollTop-ce.clientHeight<40;m.value=!i.value&&!Re&&t.value.length>0,E.value&&ye()}function ye(){const ce=p.value;!ce||!i.value||ce.scrollHeight-ce.scrollTop-ce.clientHeight>=40&&(i.value=!1,m.value=t.value.length>0)}function _e(){i.value&&requestAnimationFrame(ye)}function $e(ce){he.has(ce.key)&&_e()}const E=f(!1);function P(){i.value&&(E.value=!0,requestAnimationFrame(ye))}function V(){E.value&&(E.value=!1,ye())}function pe(){i.value&&(m.value=!1,Pt(()=>ne()))}function $(){if(n.value=!n.value,!n.value&&A.value.length>0){for(const ce of A.value)fe(ce);A.value=[]}}function Y(){t.value=[],A.value=[],m.value=!1}function ue(){let ce;e.value==="search"?ce=Fe.value.map(It=>{const yt=It.error?"ERROR":"INFO",pa=It.tool_name?`[${It.tool_name}] `:"";return`${It.timestamp||""} ${yt} ${pa}${It.result_summary||It.message||""}`}).join(`
`):ce=Q.value.map(ef).join(`

`);const Re=new Blob([ce],{type:"text/plain"}),Je=URL.createObjectURL(Re),nt=document.createElement("a");nt.href=Je,nt.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,nt.click(),URL.revokeObjectURL(Je)}function H(ce){const Re=ef(ce);navigator.clipboard.writeText(Re).then(()=>{h.value=ce.id,setTimeout(()=>{h.value=null},1500)}).catch(()=>{})}function te(ce){l.value=l.value===ce?"":ce,v.value="all"}function X(ce){return ce.level==="ERROR"?"log-line-error":ce.level==="WARNING"?"log-line-warning":"text-gray-300"}function be(ce){return ce==="ERROR"?"text-red-500 font-semibold":ce==="WARNING"?"text-yellow-500":"text-blue-500"}function ge(ce){return ce==="ERROR"?"log-chip-error":ce==="WARNING"?"log-chip-warning":"log-chip-info"}function me(ce){v.value=ce.id;const Re=ce.filters;l.value=Re.level||"",b.value=Re.timeRange||"",o.value=Re.text||"",Re.levels&&(l.value=Re.levels[0]||""),Re.hasToolName&&(o.value="")}function Te(ce){v.value=ce.id,l.value=ce.filters.level||"",b.value=ce.filters.timeRange||"",o.value=ce.filters.text||""}function De(){if(!C.value.trim())return;const ce={id:"custom-"+Date.now(),name:C.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};x.value=[...x.value,ce],I(),k.value=!1,C.value=""}function je(ce){x.value=x.value.filter(Re=>Re.id!==ce),I(),v.value===ce&&(v.value="all")}const ze=f("all"),qe=f(""),We=f(""),ot=f(""),Ke=f(""),ee=f(""),we=f(100),Ae=t1,Le=f(!1),ae=f(!1),Oe=f(""),Fe=f([]),rt=f(null),Zt=f(null);function ht(){e.value="search",rt.value||xt()}async function xt(){try{rt.value=await z.get("/api/logs/stats")}catch{}}function qt(){const ce=ee.value;if(!ce){ot.value="",Ke.value="";return}const Je={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ce];if(Je){const nt=new Date(Date.now()-Je*1e3);ot.value=Es(nt),Ke.value=""}}function Es(ce){const Re=Je=>String(Je).padStart(2,"0");return`${ce.getFullYear()}-${Re(ce.getMonth()+1)}-${Re(ce.getDate())}T${Re(ce.getHours())}:${Re(ce.getMinutes())}`}function da(ce){if(!ce)return"";const Re=new Date(ce);return isNaN(Re.getTime())?"":Re.toISOString()}async function sa(){Le.value=!0,Oe.value="",ae.value=!0,Zt.value=null;try{const ce=new URLSearchParams;ze.value&&ze.value!=="all"&&ce.set("level",ze.value),qe.value&&ce.set("tool",qe.value),We.value&&ce.set("q",We.value);const Re=da(ot.value),Je=da(Ke.value);Re&&ce.set("start",Re),Je&&ce.set("end",Je),ce.set("limit",String(we.value));const nt=await z.get(`/api/logs/search?${ce.toString()}`);Fe.value=nt.entries||[]}catch(ce){Oe.value=ce.message||"Search failed",Fe.value=[]}finally{Le.value=!1}}function xn(){ze.value="all",qe.value="",We.value="",ot.value="",Ke.value="",ee.value="",we.value=100,Fe.value=[],ae.value=!1,Oe.value="",Zt.value=null}function Ta(ce){Zt.value=Zt.value===ce?null:ce}function Vs(ce){if(!ce.timestamp)return"";try{return new Date(ce.timestamp).toLocaleString()}catch{return ce.timestamp}}function ua(ce){return ce.type==="web_action"?`${ce.status||""} (${ce.execution_time_ms||0}ms)`:(ce.result_summary||"").slice(0,200)}function Ds(ce){return ce.error?"log-line-error":"text-gray-300"}function _n(ce){try{return JSON.stringify(ce,null,2)}catch{return String(ce)}}let qs=null,ut=!1;function Gs(){ut||(ut=!0,lt.subscribe("logs",J),c.value=lt.connected,d.value=lt.state||"disconnected",qs=lt.onState(ce=>{d.value=ce,c.value=ce==="connected"}))}function Ca(){ut&&(ut=!1,lt.unsubscribe("logs",J),qs&&(qs(),qs=null))}return Qe(()=>{_(),window.addEventListener("pointerup",V),window.addEventListener("pointercancel",V)}),rs(Gs),Jt(Ca),bt(()=>{Ca(),window.removeEventListener("pointerup",V),window.removeEventListener("pointercancel",V)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Q,pauseBuffer:A,showJumpBottom:m,copiedIndex:h,regexError:F,levels:R,logPresets:O,timeRanges:y,timeRange:b,activeLogPreset:v,customLogPresets:x,showSaveLogPreset:k,newLogPresetName:C,hasActiveLogFilters:U,timeRangeLabel:T,timelineBuckets:W,timelineMax:M,timelineSpanLabel:L,timelineLabelSkip:D,togglePause:$,clearLogs:Y,exportLogs:ue,logLineClass:X,levelClass:be,levelChipClass:ge,toggleLevel:te,copyLine:H,jumpToBottom:K,onScroll:ve,onUserScrollIntent:_e,onUserScrollKey:$e,onAutoScrollToggle:pe,onPointerDown:P,applyLogPreset:me,applyCustomLogPreset:Te,saveLogCustomPreset:De,removeLogCustomPreset:je,segmentHeight:ie,jumpToTimelineBucket:B,searchLevel:ze,searchTool:qe,searchKeyword:We,searchStart:ot,searchEnd:Ke,searchTimePreset:ee,searchLimit:we,searchLimits:Ae,searching:Le,searchRan:ae,searchError:Oe,searchResults:Fe,searchStats:rt,expandedSearch:Zt,switchToSearch:ht,runSearch:sa,clearSearchFilters:xn,toggleSearchExpand:Ta,formatSearchTs:Vs,searchEntryText:ua,searchLogLineClass:Ds,formatJson:_n,applySearchTimePreset:qt}}};function vo(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const a1=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function n1(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const Ti=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],i1={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},go=new Set(["llm_provider","openai_codex","ollama","openai_compatible","kimi","personality","discord","computer"]),l1=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function sf(e){return l1.some(t=>e===t||e.startsWith(`${t}.`))}const Kv="odin_config_center_expanded_v1",Jv="odin_config_center_category_v1",o1=50,r1=650,el=()=>z.get("/api/config/meta");function An(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function hi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function li(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function c1(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function d1(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Zv(e,t){if(hi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return An(t);const a={};for(const[n,i]of Object.entries(t)){const l=Zv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function u1(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=Zv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function Yv(e,t,s,a){if(hi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Yv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function p1(){try{const e=JSON.parse(localStorage.getItem(Kv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function f1(){try{const e=localStorage.getItem(Jv);return Ti.some(t=>t.key===e)?e:Ti[0].key}catch{return Ti[0].key}}const m1={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(S){i.value=S||null,S&&typeof S.authorized=="boolean"&&(l.value=S.authorized)}async function m(){try{const S=await z.get("/api/setup/status");p(S.listener),u.value=""}catch(S){p(null),u.value=`Listener status could not be loaded: ${S.message||"Unknown error"}`}}async function h(){if(!(!pe.value||!o.value.trim()||r.value||V.value)){r.value=!0,c.value="",d.value="";try{const S=z.setListenerExposure(o.value.trim(),l.value);o.value="";const q=await S;c.value=q.message,p(q.listener)}catch(S){d.value=S.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const g=f(null),R=["image_model","outer_model"],O=f(null),y=f(null),v=f(null),b=f(!1),x=f(!1),k=f(null),C=f(""),A=f("all"),_=f(f1()),I=f(p1()),U=f({}),T=f({}),F=f(""),Z=f({}),W=f({}),M=f([]),L=f([]),D=f(!1),le=f(!1),ie=f(!1);let B=null,Q=null,re={path:null,at:0},J=0;const fe=j(()=>{var S;return(((S=t.value)==null?void 0:S.fields)||[]).filter(q=>!go.has(q.path.split(".")[0])&&!sf(q.path))}),ne=j(()=>new Map(fe.value.map(S=>[S.path,S]))),K=j(()=>$e.value.reduce((S,q)=>S+q.sections.length,0)),he=j(()=>fe.value.length),ve=j(()=>a1),ye=j(()=>M.value.length>0),_e=j(()=>L.value.length>0),$e=j(()=>{if(!e.value)return[];const S=new Set(Ti.flatMap(ke=>ke.sections)),q=Ti.map(ke=>({...ke,sections:ke.sections.filter(He=>Object.hasOwn(e.value,He)&&!go.has(He))})).filter(ke=>ke.sections.length),se=Object.keys(e.value).filter(ke=>!S.has(ke)&&!go.has(ke));return se.length&&q.push({key:"other",label:"Other",icon:"folder",sections:se}),q}),E=j(()=>e.value?{...e.value,...U.value}:null),P=j(()=>{if(!e.value)return[];const S=[];for(const[q,se]of Object.entries(U.value))Yv(e.value[q],se,q,S);return S.filter(q=>!hi(q.oldVal,q.newVal)).map(q=>{const se=ot(q.path);return{...q,label:(se==null?void 0:se.label)||li(q.path.split(".").at(-1)),apply_mode:(se==null?void 0:se.apply_mode)||Oe(q.path.split(".")[0])}})}),V=j(()=>P.value.length>0),pe=j(()=>!!i.value&&l.value!==i.value.authorized),$=j(()=>{var q;const S=(q=i.value)==null?void 0:q.state;return S==="active"||S==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(S)?"pending":S==="restricted"?"restricted":"unknown"}),Y=j(()=>{var S;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(S=i.value)==null?void 0:S.state]||"Loading listener state"}),ue=j(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),H=j(()=>{var S;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(S=i.value)==null?void 0:S.configured_host_source]||"source unavailable"}),te=j(()=>{const S=i.value;return!S||S.running_scope==="unavailable"?"Actual bound address unavailable":`${(S.listening_hosts||[]).map((se,ke)=>{var wt;const He=(wt=S.listening_ports)==null?void 0:wt[ke];return He?`${se}:${He}`:se}).join(", ")} · ${S.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),X=j(()=>P.value.length),be=j(()=>new Set(P.value.map(S=>S.path.split(".")[0])).size),ge=j(()=>!!C.value||A.value!=="all"),me=j(()=>{const S={...W.value};for(const q of P.value){const se=ot(q.path),ke=oe(se,q.newVal);ke&&(S[q.path]=ke)}return S}),Te=j(()=>Object.keys(me.value).length>0),De=j(()=>e.value?(ge.value?$e.value:$e.value.filter(q=>q.key===_.value)).map(q=>({...q,sections:q.sections.filter(se=>qs(se))})).filter(q=>q.sections.length):[]),je=j(()=>{const S=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],q=new Map(S.map(se=>[se,[]]));for(const se of P.value){const ke=q.has(se.apply_mode)?se.apply_mode:"restart";q.get(ke).push(se)}return S.filter(se=>q.get(se).length).map(se=>({key:se,label:$t(se),entries:q.get(se)}))}),ze=j(()=>P.value.filter(S=>S.apply_mode==="restart").length),qe=j(()=>fe.value.filter(S=>S.pending_restart)),We=j(()=>qe.value.length);function ot(S){const q=ne.value.get(S);return q?{...q,apply_details:vo([q])}:null}function Ke(S){const q=`${S}.`;return fe.value.filter(se=>se.path===S||se.path.startsWith(q))}function ee(){return fe.value.some(S=>S.path==="tools.hosts"||S.path.startsWith("tools.hosts."))}function we(){var se,ke;const S=((ke=(se=e.value)==null?void 0:se.tools)==null?void 0:ke.hosts)||{},q=Object.keys(S).length;return`${q} host${q===1?"":"s"} configured.`}function Ae(S){return Ke(S).length}function Le(S){return li(S)}function ae(S){const q=Ke(S);if(!q.length)return`${li(S)} configuration.`;const se=q.find(wt=>wt.sensitivity==="public"&&wt.description)||q.find(wt=>wt.description),ke=(se==null?void 0:se.description)||"";return ke.match(/setting for (.+)\.$/i)?`${li(S)} settings and runtime behaviour.`:ke}function Oe(S){const q=[...new Set(Ke(S).map(se=>se.apply_mode))];return q.length===1?q[0]:q.includes("restart")?"restart":q.includes("activation_required")?"activation_required":q[0]||"restart"}function Fe(S){const q=[...new Set(Ke(S).map(se=>$t(se.apply_mode)))];return q.length?q.length===1?q[0]:`Mixed apply behaviour: ${q.join(" · ")}`:""}function rt(S){return vo(Ke(S))}function Zt(S){var q;return Object.hasOwn(U.value,S)?U.value[S]:(q=e.value)==null?void 0:q[S]}function ht(){const S=Zt("mcp")||{},q=Object.keys(S.servers||{}).length;return`${S.enabled?"Globally enabled":"Globally disabled"} · ${q} configured server${q===1?"":"s"}.`}function xt(S,q){return q.split(".").reduce((se,ke)=>se==null?void 0:se[ke],S)}function qt(S){const q=E.value;return Ke(S).filter(se=>sf(se.path)?!1:se.path.split(".").length<=2?!0:!se.path.includes(".*")).map(se=>({...se,key:se.path.split(".").at(-1),value:xt(q,se.path),apply_details:vo([se]),editor:se.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Es(S){const q=S.path.split(".");return q.length>2?q.slice(0,2).join("."):null}function da(S){const q=new Map;for(const se of qt(S)){const ke=Es(se),He=ke||`${S}.__root`;q.has(He)||q.set(He,{key:He,path:ke,entries:[]}),q.get(He).entries.push(se)}return[...q.values()].map(se=>{const ke=se.entries.find(He=>He.group_description);return{...se,label:se.path?li(se.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:vo(se.entries),runtime_summaries:xn(se.entries)}})}function sa(S){return{save:S.save_effect||(S.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:S.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[S.apply_mode]||"Effective runtime state is not currently observable."}}function xn(S){const q=new Map;for(const se of S){const ke=sa(se),He=`${se.apply_mode}|${ke.save}|${ke.runtime}`;q.has(He)||q.set(He,{key:He,label:$t(se.apply_mode),save:ke.save,runtime:ke.runtime})}return[...q.values()]}function Ta(S){if(Vs(S))return S.runtime_effect||S.activation_policy||"";if(S.apply_mode==="activation_required"){const q=S.activation_policy||S.runtime_effect;return q?`Not active after saving. No activation control exists in this release. ${q}`:"Not active after saving; no activation control exists in this release."}return""}function Vs(S){return S.action_available===!0&&!!(S.action_label&&S.action_endpoint)}async function ua(S){if(Vs(S))try{if(Re(S.path))throw new Error("Save this setting before applying its action.");const q=String(S.action_method||"POST").toLowerCase(),se={post:z.post.bind(z),put:z.put.bind(z),delete:z.del.bind(z)}[q];if(!se)throw new Error("Unsupported configuration action");await se(S.action_endpoint,S.action_body||void 0),await ss(),Oa("success",`${S.action_label} completed.`)}catch(q){Oa("error",q.message||`${S.action_label} failed`)}}function Ds(S,q){return[S.label,S.path,S.description,...S.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(q)}function _n(S){const q=C.value.trim().toLowerCase();return q?Ke(S).filter(se=>Ds(se,q)):[]}function qs(S){const q=Ke(S);if(A.value!=="all"&&!q.some(ke=>ke.apply_state===A.value))return!1;const se=C.value.trim().toLowerCase();return!se||`${Le(S)} ${S}`.toLowerCase().includes(se)?!0:q.some(ke=>Ds(ke,se))}function ut(S,q){return Ke(S).filter(se=>se.apply_state===q).length}function Gs(S){return S==="all"?he.value:fe.value.filter(q=>q.apply_state===S).length}function Ca(S){const q=S.sections.flatMap(se=>Ke(se));return{fields:q.length,modified:P.value.filter(se=>S.sections.includes(se.path.split(".")[0])).length,pending_restart:q.filter(se=>se.apply_state==="pending_restart").length,invalid:q.filter(se=>se.apply_state==="invalid").length,dormant:q.filter(se=>se.apply_state==="dormant").length}}function ce(S){var q;return Object.hasOwn(U.value,S)&&!hi((q=e.value)==null?void 0:q[S],U.value[S])}function Re(S){return P.value.some(q=>q.path===S||q.path.startsWith(`${S}.`))}function Je(S){_.value=S,C.value="",A.value="all";try{localStorage.setItem(Jv,S)}catch{}}function nt(S){A.value=S}function It(){C.value="",A.value="all"}function yt(S){var q;return((q=$e.value.find(se=>se.sections.includes(S)))==null?void 0:q.sections)||[]}function pa(S){const q=yt(S),se=q.find(ke=>I.value[ke]===!0);return se||q.find(ke=>I.value[ke]!==!1)||null}function cs(S){return C.value&&!ie.value&&qs(S)?!0:ie.value?pa(S)===S:Object.hasOwn(I.value,S)?I.value[S]===!0:!0}function zi(S){const q=!cs(S);if(ie.value){const se={...I.value};for(const ke of yt(S))se[ke]===!0&&(se[ke]=!1);se[S]=q,I.value=se;return}I.value={...I.value,[S]:q}}function Kn(){M.value.push(An(U.value)),M.value.length>o1&&M.value.shift(),L.value=[]}function wn(){n.value||V.value&&(Kn(),U.value={},W.value={},D.value=!1)}function Jn(S,q=!1){const se=Date.now();if(q&&re.path===S&&se-re.at<r1){re.at=se;return}Kn(),re={path:S,at:se}}function Ea(S,q,se){if(!q.length)return se;const ke=An(S??{});let He=ke;for(let wt=0;wt<q.length-1;wt+=1){const Fs=q[wt];He[Fs]=An(He[Fs]??{}),He=He[Fs]}return He[q.at(-1)]=se,ke}function Aa(S){var q;return Object.hasOwn(U.value,S)?U.value[S]:An((q=e.value)==null?void 0:q[S])}function Yt(S,q,se={}){var La;if(n.value||go.has(S.path.split(".")[0]))return;const[ke,...He]=S.path.split(".");Jn(S.path,!!se.coalesce);const wt=Aa(ke),Fs=He.length?Ea(wt,He,q):q,ds={...U.value};if(hi(Fs,(La=e.value)==null?void 0:La[ke])?delete ds[ke]:ds[ke]=Fs,U.value=ds,W.value[S.path]){const aa={...W.value};delete aa[S.path],W.value=aa}}function Ps(S){re={path:null,at:0},T.value={...T.value,[S]:String(xt(E.value,S)??"")}}function ts(S){if(re={path:null,at:0},!Object.hasOwn(T.value,S))return;const q={...T.value};delete q[S],T.value=q}function Zn(S){const q=T.value[S.path];if(re={path:null,at:0},q===""){if(S.nullable){ts(S.path),Yt(S,null,{coalesce:!0});return}W.value={...W.value,[S.path]:"Enter a number."};return}const se=Number(q);if(Number.isNaN(se)||S.type==="integer"&&!Number.isInteger(se)){W.value={...W.value,[S.path]:S.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...T.value};delete ke[S.path],T.value=ke,Yt(S,se,{coalesce:!0})}function Yn(S){return Object.hasOwn(T.value,S.path)?T.value[S.path]:S.value??""}function Hi(S,q){if(T.value={...T.value,[S.path]:q},q===""){if(S.nullable){Yt(S,null,{coalesce:!0});return}W.value={...W.value,[S.path]:"Enter a number."};return}const se=Number(q);if(!Number.isFinite(se)||S.type==="integer"&&!Number.isInteger(se)){W.value={...W.value,[S.path]:S.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(W.value[S.path]){const ke={...W.value};delete ke[S.path],W.value=ke}Yt(S,se,{coalesce:!0})}function Qn(S){const q=Number.parseInt(F.value,10);if(!Number.isInteger(q)||q<1){W.value={...W.value,[S.path]:"Warning thresholds must be positive whole numbers."};return}const se=[...new Set([...S.value||[],q])].sort((ke,He)=>He-ke);F.value="",Yt(S,se)}function kn(S,q){Yt(S,(S.value||[]).filter(se=>se!==q))}function an(S){return S.apply_mode==="live_read"?"Odin reads the saved file value on next use.":S.apply_mode==="live_for_new_work"?"New work uses the saved file value.":S.apply_mode==="live_apply"?S.apply_handler?`Apply the saved value through ${S.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":S.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":S.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":S.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Ra(S){return S.type==="array"&&Array.isArray(S.value)&&!S.structured_container&&!S.structured_container_child&&S.sensitivity==="public"&&S.value.every(q=>["string","number","boolean"].includes(typeof q))}function Ee(S){const q=String(Z.value[S.path]??"").trim();if(!q)return;const se=[...new Set([...S.value||[],q])];Z.value={...Z.value,[S.path]:""},Yt(S,se)}function N(S,q){Yt(S,(S.value||[]).filter(se=>se!==q))}function oe(S,q){var ke;if(!S)return null;if((ke=S.enum)!=null&&ke.length&&!S.enum.includes(q))return`Choose one of: ${S.enum.join(", ")}`;if(S.path==="agents.final_warning_iterations"&&(!Array.isArray(q)||!q.length))return"Add at least one warning threshold.";const se=S.constraints||{};if((S.type==="integer"||S.type==="number")&&typeof q=="number"){if(se.minimum!==void 0&&q<se.minimum)return`Must be at least ${se.minimum}${S.unit?` ${S.unit}`:""}`;if(se.maximum!==void 0&&q>se.maximum)return`Must be at most ${se.maximum}${S.unit?` ${S.unit}`:""}`}return null}function xe(S){return me.value[S.path]||null}function Me(S){const q=`${S}.`;return Object.keys(me.value).some(se=>se===S||se.startsWith(q))}function Pe(){n.value||M.value.length&&(L.value.push(An(U.value)),U.value=M.value.pop(),W.value={},T.value={},re={path:null,at:0})}function Ve(){n.value||L.value.length&&(M.value.push(An(U.value)),U.value=L.value.pop(),W.value={},T.value={},re={path:null,at:0})}function Ct(){!V.value||Te.value||(D.value=!0,le.value=!1)}function pt(){D.value=!1}function St(){wn()}function $t(S){return i1[S]||li(S||"unknown")}function Ce(S){return`apply-${String(S||"unknown").replaceAll("_","-")}`}function Ia(S){return`cfgc-field-${S.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Xn(S){return`${Ia(S)}-input`}function Fr(S){const q=document.getElementById(Ia(S))||document.getElementById(Ia(S.split(".").slice(0,2).join(".")));q==null||q.scrollIntoView({behavior:"smooth",block:"center"})}function Oa(S,q){y.value={type:S,message:q},window.setTimeout(()=>{var se;((se=y.value)==null?void 0:se.message)===q&&(y.value=null)},3500)}function $r(){b.value=!1,A.value="pending_restart",C.value="";const S=n1(a.value);S&&(S.scrollTop=0)}function Ur(){b.value=!1}function Xl(S=1800){Q&&window.clearTimeout(Q),Q=window.setTimeout(Br,S)}async function Br(){if(x.value){if(J+=1,J>45){x.value=!1,k.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await el(),We.value===0){x.value=!1,k.value=null,Oa("success","Odin restarted and the saved startup settings are active.");return}}catch{}Xl(2e3)}}async function zr(){if(!x.value){k.value=null;try{await z.post("/api/restart",{}),x.value=!0,J=0,b.value=!1,Xl()}catch(S){k.value=S.message||"Odin could not schedule a restart."}}}async function Hr(){if(!(!V.value||Te.value||n.value)){n.value=!0;try{const S=u1(e.value,U.value),q=await z.put("/api/config",S);e.value=q,U.value={},M.value=[],L.value=[],W.value={},D.value=!1;try{t.value=await el(),v.value=null,b.value=We.value>0,Oa("success",We.value?`Configuration saved. ${We.value} setting${We.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(se){v.value=se.message||"Unknown metadata error.",Oa("error",`Configuration saved, but apply status could not be refreshed: ${v.value}`)}}catch(S){Oa("error",S.message||"Configuration could not be saved")}finally{n.value=!1}}}async function jr(){if(!n.value){n.value=!0,g.value=null;try{t.value=await el(),v.value=null}catch(S){g.value=`Image model status could not be refreshed: ${S.message||"Unknown error"}`}finally{n.value=!1}}}async function Ws(S,q){if(n.value||!["follow","pin"].includes(q)||!S.length||S.some(ke=>{var He,wt;return!R.includes(ke)||!((wt=(He=t.value)==null?void 0:He.image_model_defaults)!=null&&wt[ke])}))return;n.value=!0,g.value=null;let se=!1;try{const ke=await z.post("/api/config/image-models",{operations:Object.fromEntries(S.map(He=>[He,q])),expected_revision:t.value.image_model_revision});se=!0;for(const He of S){const wt=`image.openai.${He}`,Fs=xt(e.value,wt),ds=xt(ke.config,wt),La=aa=>!Object.hasOwn(aa,"image")||!hi(xt(aa,wt),Fs)?aa:Ea(aa,wt.split("."),ds);U.value=La(U.value),M.value=M.value.map(La),L.value=L.value.map(La),e.value=Ea(e.value,wt.split("."),ds)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},Oa("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){g.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await el(),v.value=null}catch(ke){const He=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;v.value=He,g.value=se?`Image model defaults were saved, but ${He}`:`${g.value} ${He}`}finally{n.value=!1}}async function ss(){var S,q;if(!(V.value||n.value)){s.value=!0,O.value=null;try{const se=await z.get("/api/config"),ke=await el();await m(),e.value=se,t.value=ke,v.value=null;const He=$e.value;if(He.some(wt=>wt.key===_.value)||(_.value=((S=He[0])==null?void 0:S.key)||Ti[0].key),ie.value){const Fs=(((q=He.find(ds=>ds.key===_.value))==null?void 0:q.sections)||[]).find(ds=>I.value[ds]===!0);I.value=Fs?{...I.value,[Fs]:!0}:{}}}catch(se){O.value=se.message||"Unknown configuration error"}finally{s.value=!1}}}function fa(S){if(D.value||!(S.ctrlKey||S.metaKey))return;const q=S.target;q instanceof HTMLElement&&(q.matches("input, textarea, select")||q.isContentEditable)||(!S.shiftKey&&S.key.toLowerCase()==="z"?(S.preventDefault(),Pe()):(S.key.toLowerCase()==="y"||S.shiftKey&&S.key.toLowerCase()==="z")&&(S.preventDefault(),Ve()))}function nn(S){ie.value=S.matches}jt(I,S=>{try{localStorage.setItem(Kv,JSON.stringify(S))}catch{}},{deep:!0});let bs=!1;function ji(){bs||(bs=!0,document.addEventListener("keydown",fa))}function Vi(){bs&&(bs=!1,document.removeEventListener("keydown",fa))}return Qe(()=>{var S;ss(),ji(),B=window.matchMedia("(max-width: 760px)"),nn(B),(S=B.addEventListener)==null||S.call(B,"change",nn)}),rs(ji),Jt(Vi),Jt(()=>{o.value=""}),bt(()=>{var S;o.value="",Vi(),(S=B==null?void 0:B.removeEventListener)==null||S.call(B,"change",nn),Q&&window.clearTimeout(Q)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:pe,listenerStatusTone:$,listenerStatusLabel:Y,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:H,listenerRunningCopy:te,saveListenerConsent:h,armKeydown:ji,disarmKeydown:Vi,handleKeydown:fa,config:e,meta:t,loading:s,saving:n,error:O,toast:y,metaRefreshError:v,restartPromptOpen:b,restartScheduled:x,restartError:k,configMain:a,imageModelError:g,imageModelLeaves:R,setImageModelDefaults:Ws,refreshImageModelMetadata:jr,searchQuery:C,healthFilter:A,activeCategory:_,reviewOpen:D,mobileOverflowOpen:le,warningThresholdInput:F,arrayInputs:Z,healthFilters:ve,visibleCategories:$e,displayGroups:De,reviewGroups:je,sectionCount:K,fieldCount:he,hasChanges:V,changeCount:X,changedSectionCount:be,hasDraftErrors:Te,canUndo:ye,canRedo:_e,globalFilterActive:ge,reviewRestartCount:ze,pendingRestartCount:We,pendingRestartFields:qe,healthCount:Gs,categoryStats:Ca,selectCategory:Je,selectHealthFilter:nt,clearFilters:It,sectionLabel:Le,sectionDescription:ae,sectionFieldCount:Ae,sectionHealthCount:ut,sectionApplySummary:Fe,sectionApplyDetails:rt,sectionEntries:qt,fieldGroups:da,sectionSearchHits:_n,mcpConfigSummary:ht,fieldRuntimeCopy:sa,fieldSpecificRuntimeNote:Ta,hasHonestAction:Vs,runFieldAction:ua,hasHostsCollection:ee,hostsConfigSummary:we,sectionChanged:ce,fieldChanged:Re,isSectionExpanded:cs,toggleSection:zi,discardAllDrafts:wn,setFieldValue:Yt,setNumberFieldValue:Hi,numberInputValue:Yn,beginInputEdit:Ps,endTextInputEdit:ts,endInputEdit:Zn,addWarningThreshold:Qn,removeWarningThreshold:kn,isScalarArray:Ra,addScalarArrayItem:Ee,removeScalarArrayItem:N,fieldError:xe,sectionHasErrors:Me,undo:Pe,redo:Ve,openReview:Ct,closeReview:pt,mobileCancel:St,applyModeLabel:$t,applyClass:Ce,compactValue:c1,formatValue:d1,structuredApplyCopy:an,fieldId:Ia,fieldInputId:Xn,focusField:Fr,fetchConfig:ss,saveConfig:Hr,restartOdin:zr,restartLater:Ur,reviewPendingRestart:$r}}},h1=/^\d{15,25}$/;function Qv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Xv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=j(()=>new Set((e.excludedIds||[]).map(String))),o=j(()=>{const x=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:x?u(k).toLowerCase().includes(x)||String(k.username||"").toLowerCase().includes(x)||String(k.id).includes(x):!0)}),r=j(()=>{const x=s.value.trim();return o.value.length===0&&h1.test(x)&&!l.value.has(x)?x:""}),c=j(()=>o.value.length+(r.value?1:0)),d=j(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(x){return Qv(x)}function p(){a.value=!0,n.value=0}function m(){p()}function h(){const x=Math.max(c.value-1,0);n.value=Math.min(n.value+1,x)}function g(){n.value=Math.max(n.value-1,0)}function R(){const x=o.value[n.value];x?O(x):r.value&&n.value===o.value.length&&y(r.value)}function O(x){y(String(x.id))}function y(x){t("select",x),s.value="",a.value=!1,n.value=0}function v(){a.value=!1}function b(){setTimeout(v,150)}return Qe(()=>{e.autofocus&&Pt(()=>{var x;return(x=i.value)==null?void 0:x.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:m,highlightNext:h,highlightPrevious:g,selectHighlighted:R,selectMember:O,selectId:y,closeOptions:v,onBlur:b}}};function af(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const v1={components:{DiscordUserCombobox:Xv},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),m=f({}),h=f([]);let g=0;const R=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),O=j(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=j(()=>new Map(h.value.map(ne=>[String(ne.id),ne])));function v(ne){return ne.config&&ne.config.enabled!==void 0?ne.config.enabled:!0}function b(ne){return af(ne,"require_mention",c.value)}function x(ne){return af(ne,"respond_to_bots",c.value)}function k(ne){return ne.config&&Object.keys(ne.config).length>0}function C(ne){r.value[ne]=!r.value[ne]}function A(ne){const K=ne.discord||{};return{allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]}}async function _({showLoading:ne=!0}={}){const K=++g;ne&&(l.value=!0),o.value=null;try{const he=await z.get("/api/discord/guilds");K===g&&(e.value=he)}catch(he){K===g&&(o.value=he.message)}finally{ne&&K===g&&(l.value=!1)}}async function I(){try{t.value=await z.get("/api/discord/connection"),n.value=null}catch(ne){n.value=ne.message}}async function U(ne,K=null){if(!a.value){a.value=!0,n.value=null;try{const he={operation:ne};K!==null&&(he.token=K),t.value=await z.post("/api/discord/connection",he),ne==="credentials"&&(s.value="")}catch(he){n.value=he.message||"Connection update failed."}finally{a.value=!1}}}function T(){return U("credentials",s.value)}function F(){return U("connect")}function Z(){return U("detach")}async function W(){l.value=!0,o.value=null;try{const[ne,K,he]=await Promise.all([z.get("/api/discord/guilds"),z.get("/api/discord/members").catch(()=>[]),z.get("/api/config")]),ve=A(he),ye=O.value;c.value=ve,ye||(d.value=JSON.parse(JSON.stringify(ve))),h.value=K,e.value=ne,p.value=null}catch(ne){o.value=ne.message}finally{l.value=!1}}let M=Promise.resolve();const L=f(new Set);function D(ne,K){const he=new Set(L.value);he.add(ne),L.value=he;const ve=M.then(K);return M=ve.catch(()=>{}),ve.finally(()=>{const ye=new Set(L.value);ye.delete(ne),L.value=ye})}function le(ne,K,he,ve){const ye=(ve==null?void 0:ve.target)??null;return D(`guild:${ne}:${K}`,async()=>{try{await z.put("/api/discord/guild/"+ne+"/config",{[K]:he}),await _({showLoading:!1})}catch(_e){o.value=_e.message,ye&&typeof he=="boolean"&&(ye.checked=!he)}})}function ie(ne,K,he,ve,ye){const _e=(ye==null?void 0:ye.target)??null;return D(`channel:${ne}:${he}`,async()=>{try{await z.put("/api/discord/channel/"+ne+"/config",{[he]:ve}),await _({showLoading:!1})}catch($e){o.value=$e.message,_e&&typeof ve=="boolean"&&(_e.checked=!ve)}})}function B(ne,K){return D(`channel:${ne}:clear`,async()=>{try{await z.put("/api/discord/channel/"+ne+"/config",{clear:!0}),await _({showLoading:!1})}catch(he){o.value=he.message}})}function Q(ne,K){const he=String(K);if(!ne.userAutocomplete)return he;const ve=y.value.get(he);return ve?Qv(ve):he}function re(ne,K=null){const he=String(K??m.value[ne]??"").trim();!he||d.value[ne].includes(he)||(d.value[ne]=[...d.value[ne],he],m.value={...m.value,[ne]:""})}function J(ne,K){d.value[ne]=d.value[ne].filter(he=>he!==K)}async function fe(){if(!(!O.value||u.value)){u.value=!0,p.value=null;try{const K=(await z.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(ne){p.value=ne.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Qe(()=>{W(),I(),i=window.setInterval(I,5e3)}),bt(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:m,globalMembers:h,globalListEditors:R,globalChanged:O,guildEnabled:v,guildMention:b,guildBots:x,hasOverride:k,toggleGuild:C,fetchAll:W,fetchGuilds:_,setGuildConfig:le,setChannelConfig:ie,clearOverride:B,mutationPending:L,globalItemLabel:Q,addGlobalItem:re,removeGlobalItem:J,saveGlobalDefaults:fe,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:T,connectDiscord:F,detachDiscord:Z}}},$s=e=>e==null?e:JSON.parse(JSON.stringify(e));function g1({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let m=null;const h=new Map;function g(k){d+=1;const C=c.then(k,k);return c=C.catch(()=>{}),C}function R(k,C){m=$s(k),h.clear();for(const[A,_]of Object.entries(C||{}))h.set(A,$s(_))}function O(k){const C=$s(k),A=++u;return g(async()=>{try{await e($s(C)),m=$s(C),A===u&&a($s(C))}catch(_){A===u&&(n($s(m)),r(_,{kind:"default"}))}})}function y(k,C){const A=$s(C),_=(p.get(k)||0)+1;return p.set(k,_),g(async()=>{try{await t(k,$s(A)),h.set(k,$s(A)),_===p.get(k)&&i(k,$s(A))}catch(I){_===p.get(k)&&(l(k,$s(h.get(k)??null)),r(I,{kind:"user",uid:k}))}})}function v(k){const C=(p.get(k)||0)+1;return p.set(k,C),g(async()=>{try{await s(k),h.delete(k),C===p.get(k)&&o(k)}catch(A){C===p.get(k)&&(l(k,$s(h.get(k)??null)),r(A,{kind:"delete",uid:k}))}})}async function b(){for(;;){const k=c;if(await k,k===c)return d}}async function x(k){for(;;){const C=await b(),A=await k();if(C===d)return A}}return{seed:R,saveDefault:O,saveUser:y,deleteUser:v,whenIdle:b,readSnapshot:x,get revision(){return d}}}const b1={components:{DiscordUserCombobox:Xv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=j(()=>{const T={};for(const F of r.value)T[F.id]=F;return T});function d(T){return c.value[T]||null}function u(T,F){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...F],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...F],default_host:F[0]||"",allow_all:!0}}const p=g1({applyDefault:async T=>{const F=T.allow_all?null:T.allowed_hosts;await z.put("/api/host-access/default-policy",{allowed_hosts:F,default_host:T.default_host})},applyUser:async(T,F)=>{const Z=F.allow_all?null:F.allowed_hosts;await z.put(`/api/host-access/user/${T}`,{allowed_hosts:Z,default_host:F.default_host})},applyDelete:T=>z.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>Se.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const F=d(T);Se.success(`Updated access for ${F?F.display_name:T}`)},onUserRollback:(T,F)=>{const Z={...l.value};F?Z[T]=F:delete Z[T],l.value=Z},onUserDeleted:T=>{const F={...l.value};delete F[T],l.value=F},onError:(T,F)=>{var W;const Z=F.uid?` ${((W=d(F.uid))==null?void 0:W.display_name)||F.uid}`:"";Se.error(`${T.message||"Failed to save"} — reverted${Z}`)}});let m=0;async function h(){const T=++m;e.value=!0,t.value="";try{const F=await p.readSnapshot(()=>z.get("/api/host-access"));if(T!==m)return;s.value=F,a.value=F.available_hosts||[],n.value=F.host_descriptions||{},i.value=u(F.default_policy,a.value);const Z=F.users||{},W={};for(const[M,L]of Object.entries(Z))W[M]=u(L,a.value);l.value=W,p.seed(i.value,W)}catch(F){T===m&&(t.value=F.message||"Failed to fetch host access data")}finally{T===m&&(e.value=!1)}try{const F=await z.get("/api/discord/members")||[];T===m&&(r.value=F)}catch{T===m&&(r.value=[])}}const g=500,R=new Map;function O(T,F){const Z=R.get(T);Z&&clearTimeout(Z.timer);const W={run:F,timer:null};W.timer=setTimeout(()=>{R.delete(T),F()},g),R.set(T,W)}function y(T){const F=R.get(T);F&&(clearTimeout(F.timer),R.delete(T))}function v(){for(const[T,F]of[...R])clearTimeout(F.timer),R.delete(T),F.run()}function b(){O("default",()=>p.saveDefault(i.value))}function x(T,F){i.value.allow_all=!1,F?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Z=>Z!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function k(T){O(`user:${T}`,()=>{const F=l.value[T];F&&p.saveUser(T,F)})}function C(T,F,Z){const W=l.value[T];W&&(W.allow_all=!1,Z?W.allowed_hosts.includes(F)||W.allowed_hosts.push(F):(W.allowed_hosts=W.allowed_hosts.filter(M=>M!==F),W.default_host===F&&(W.default_host=W.allowed_hosts[0]||"")),k(T))}function A(T,F){const Z=l.value[T];Z&&(Z.default_host=F,k(T))}function _(){o.value=!0}function I(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function U(T){const F=d(T);await es({title:"Remove user override",message:`Remove the host access override for ${F?F.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${T}`),await p.deleteUser(T),l.value[T]||Se.success(`Removed override for ${F?F.display_name:T}`))}return Qe(h),Jt(v),bt(v),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:h,saveDefaultPolicy:b,toggleDefaultHost:x,getMember:d,toggleUserHost:C,setUserDefault:A,openAddUser:_,addUserById:I,deleteUser:U,flushPendingSaves:v}}},y1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),m=f(null),h=f(""),g=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),R=f(g()),O=j(()=>["127.0.0.1","localhost","::1"].includes(R.value.address));async function y(){t.value=!0,s.value="";try{const W=await z.get("/api/hosts");e.value=W.hosts||[],o.value=W.default_host||"",r.value=!!W.tofu_enabled}catch(W){s.value=W.message}finally{t.value=!1}}async function v(){try{await z.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),Se.success("Host settings saved and published live"),await y()}catch(W){Se.error(W.message)}}function b(){d.value="",u.value=[],p.value=!1,m.value=null,c.value=null,h.value="",l.value=1,n.value=!0}function x(){i.value=!1,R.value=g(),b()}function k(W){i.value=!0,R.value={...g(),...W},b()}async function C(){try{c.value=await z.get("/api/hosts/public-key")}catch(W){Se.error(W.message)}}async function A(W){try{const M=await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/import-legacy",{});i.value=!0,R.value={...g(),...W,trust_mode:"pinned"},b(),d.value=M.candidate_token,u.value=M.fingerprints||[],h.value=u.value.join(`
`),l.value=4,Se.info("Imported existing known_hosts trust. Test before activation.")}catch(M){Se.error(M.message)}}async function _(){try{const W=h.value.split(/\s+/).filter(Boolean),M={...R.value,expected_fingerprints:W,candidate_fingerprints:u.value},L=await z.post("/api/hosts/candidates",M);if(d.value=L.candidate_token,u.value=L.fingerprints||[],R.value.trust_mode==="tofu"&&M.candidate_fingerprints.length===0){R.value.confirm_tofu=!1,Se.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(W){Se.error(W.message)}}async function I(){var W,M;p.value=!1,m.value=null;try{const L=await z.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!L.tested,m.value=L.last_test,p.value&&(l.value=5)}catch(L){const D=(W=L.data)==null?void 0:W.last_test;D&&typeof D=="object"&&!Array.isArray(D)&&(m.value=D);const le=(M=m.value)==null?void 0:M.detail;Se.error(typeof le=="string"&&le.trim()?le:L.message)}}async function U(){try{await z.post("/api/hosts/candidates/"+d.value+"/commit",{}),Se.success("Host saved and published live"),n.value=!1,await y()}catch(W){Se.error(W.message)}}async function T(W){try{await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/enabled",{enabled:!W.enabled}),await y()}catch(M){Se.error(M.message)}}async function F(W){var M;if(await es("Delete host "+W.alias+"? Dependencies will block deletion.")){a.value=[];try{await z.del("/api/hosts/"+encodeURIComponent(W.alias)),await y()}catch(L){a.value=Array.isArray((M=L.data)==null?void 0:M.pending_references)?L.data.pending_references:[],Se.error(L.message)}}}async function Z(W){if(await es("Force revoke "+W.alias+"? Remote outcomes may be unknown."))try{await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/force-revoke",{}),await y()}catch(M){Se.error(M.message)}}return Qe(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:R,isLocal:O,keyInfo:c,candidate:d,observed:u,tested:p,testResult:m,fingerprintsText:h,load:y,saveSettings:v,beginAdd:x,beginEdit:k,loadKey:C,importLegacy:A,prepare:_,testConnection:I,commit:U,toggle:T,remove:F,forceRevoke:Z}}},x1={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=j(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=j(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function m(A){return A==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":A==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function h(){e.value=!0,t.value="";try{const A=await z.get("/api/tokens");s.value=A.tokens||[],a.value=A.available_hosts||[]}catch(A){t.value=A.message||"Failed to load tokens"}finally{e.value=!1}}function g(A){return!A||!A.trim()?[]:A.split(",").map(_=>_.trim()).filter(Boolean)}function R(A,_){const I=c.value.allowed_hosts;if(_&&!I.includes(A)&&I.push(A),!_){const U=I.indexOf(A);U>=0&&I.splice(U,1)}}function O(A,_){const I=d.value.allowed_hosts;if(_&&!I.includes(A)&&I.push(A),!_){const U=I.indexOf(A);U>=0&&I.splice(U,1)}}async function y(){var A;i.value=!0;try{const _=g(c.value.allowed_tools_str),I=c.value.host_mode,U=I==="none"?[]:I==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:_.length?_:[]};U!==null&&(T.allowed_hosts=U),T.default_host=c.value.default_host||"";const F=await z.post("/api/tokens",T);l.value=F.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,Se.success("Token created"),await h()}catch(_){Se.error(((A=_.data)==null?void 0:A.error)||_.message||"Failed to create token")}finally{i.value=!1}}function v(A){o.value=A;const _=A.allowed_hosts;let I="default";_==null?I="default":Array.isArray(_)&&_.length===0?I="none":Array.isArray(_)&&(I="select"),d.value={username:A.username||"",tier:A.tier||"admin",label:A.label||"",host_mode:I,allowed_hosts:Array.isArray(_)?[..._]:[],default_host:A.default_host||"",allowed_tools_str:(A.allowed_tools||[]).join(", ")}}async function b(){var A;if(o.value){r.value=!0;try{const _=g(d.value.allowed_tools_str),I=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:_};I==="none"?U.allowed_hosts=[]:I==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await z.put("/api/tokens/"+encodeURIComponent(o.value.user_id),U),o.value=null,Se.success("Token updated"),await h()}catch(_){Se.error(((A=_.data)==null?void 0:A.error)||_.message||"Failed to update")}finally{r.value=!1}}}async function x(A){var I;if(await es({title:"Regenerate token",message:`Regenerate token for ${A.username||A.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await z.post("/api/tokens/"+encodeURIComponent(A.user_id)+"/regenerate");l.value=U.token,Se.success("Token regenerated")}catch(U){Se.error(((I=U.data)==null?void 0:I.error)||U.message||"Failed to regenerate")}}async function k(A){var I;if(await es({title:"Delete token",message:`Delete token for ${A.username||A.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/tokens/"+encodeURIComponent(A.user_id)),Se.success("Token deleted"),await h()}catch(U){Se.error(((I=U.data)==null?void 0:I.error)||U.message||"Failed to delete")}}async function C(){if(l.value)try{await navigator.clipboard.writeText(l.value),Se.success("Copied to clipboard")}catch{Se.error("Copy failed — select and copy manually")}}return Qe(h),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:h,tierBadge:m,toggleCreateHost:R,toggleEditHost:O,createToken:y,startEdit:v,saveEdit:b,confirmRegenerate:x,confirmDelete:k,copyToken:C}}},_1=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),w1=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),k1=Object.freeze(["enabled","base_url","model","max_tokens"]),S1=Object.freeze(["enabled","base_url","model","max_tokens"]);function Yl(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function T1(e,t={}){const s=Yl(e,S1);return t.includeApiKey&&(s.api_key=e.api_key),s}function C1(e){return Yl(e,["timeout","preset","model_profiles","context_utilization","openrouter"])}function nf(e){return Yl(e,_1)}function lf(e){return Yl(e,w1)}function E1(e,{includeApiKey:t=!1}={}){const s=Yl(e,k1);return t&&(s.api_key=e.api_key),s}function A1(e){return{timeout:e.timeout}}function bo(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const R1={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">LLM Configuration</h1>
          <p class="page-lede">Provider routing, model selection, credentials, and Codex accounts.</p>
          <p v-if="llmStatus && llmStatus.serving_provider === 'codex'" class="text-xs text-green-400 mt-1">Serving through Codex</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'compat'" class="text-xs text-green-400 mt-1">Serving through OpenAI-compatible</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'ollama'" class="text-xs text-green-400 mt-1">Serving through Ollama</p>
          <p v-else-if="llmStatus" class="text-xs text-amber-400 mt-1">Selected model is unavailable</p>
        </div>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Shared model selection ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300">Model Selection</h2>
          <p class="text-xs text-gray-500 mt-1 mb-3">Choose models, not a provider. Disabled or unreachable catalogue entries remain visible.</p>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="lg:col-span-2">
              <label class="text-xs text-gray-400 block">Search model catalogue
                <input v-model="modelSelectorSearch" class="hm-input" placeholder="Filter Main, Agent, and Auxiliary choices" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Main model
                <select v-model="modelSelection.main" @change="saveMainModel" class="hm-input">
                  <optgroup v-for="group in modelGroups" :key="group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="selectedMainModel?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.main_capability" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedMainModel.efforts || reasoningEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="selectedMainModel?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Thinking
                <select :value="modelSelection.main_capability || 'adaptive'" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent model
                <select v-model="agentsConfig.model" @change="saveAgentsModel" class="hm-input">
                  <option value="">Inherit main model</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <optgroup v-for="group in modelGroups" :key="'agent:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!agentModelAvailable(model)">
                      {{ agentModelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="selectedAgentModel?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.agent_capability" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedAgentModel.efforts || reasoningEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="selectedAgentModel?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Thinking
                <select :value="modelSelection.agent_capability || 'adaptive'" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <div v-if="agentsConfig.model === 'auto' && openRouterRecognized" class="mt-3 space-y-3">
                <span class="block text-xs text-gray-400">OpenRouter Auto list builder</span>
                <p class="text-xs text-gray-500">Search the catalogue, add eligible models, then rank the selected list below. Provider pinning is configured per endpoint because routing churn destroys shared-prefix caching.</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input v-model="openRouterSearch" class="hm-input sm:col-span-2" placeholder="Search model, vendor, or capability" />
                  <select v-model="openRouterVendor" class="hm-input">
                    <option value="">All vendors</option>
                    <option v-for="vendor in openRouterVendors" :key="vendor" :value="vendor">{{ vendor }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input v-model.number="openRouterMaxPromptPrice" type="number" min="0" step="0.01" class="hm-input" placeholder="Maximum prompt $/M" />
                  <select v-model="openRouterQuantization" class="hm-input">
                    <option value="">All quantizations</option>
                    <option v-for="quant in openRouterQuantizations" :key="quant" :value="quant">{{ quant }}</option>
                  </select>
                </div>
                <div class="flex flex-wrap gap-3 text-xs text-gray-400">
                  <label class="flex items-center gap-2"><input v-model="openRouterToolsOnly" type="checkbox" class="provider-control" /> Tool-calling only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterEligibleOnly" type="checkbox" class="provider-control" /> Agent-eligible only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterStandardOnly" type="checkbox" class="provider-control" /> Standard variants only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterMeasuredCacheOnly" type="checkbox" class="provider-control" /> Measured cache only</label>
                </div>
                <div class="max-h-64 overflow-y-auto space-y-1 border border-gray-800 rounded p-2">
                  <div v-if="openRouterCatalogueLoading" class="text-xs text-gray-500">Loading OpenRouter catalogue…</div>
                  <div v-else-if="openRouterCatalogueError" class="text-xs text-red-400">{{ openRouterCatalogueError }}</div>
                  <div v-else class="text-xs text-gray-600 pb-1">Showing {{ openRouterResults.length }} of {{ openRouterMatchCount }} matches</div>
                  <div v-for="model in openRouterResults" :key="model.id" class="flex items-center justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
                    <div class="min-w-0 text-xs">
                      <div class="font-mono text-gray-300 truncate">{{ model.id }}</div>
                      <div class="text-gray-500">{{ openRouterInlineFacts(model) }}</div>
                      <div v-if="!model.agent_eligible" class="text-amber-400">{{ model.agent_unavailable_reason }}</div>
                    </div>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="!model.agent_eligible || agentsConfig.auto_model_allowlist.includes('compat:' + model.id)" @click="prepareOpenRouterModel(model)">Add</button>
                  </div>
                </div>
                <div v-if="openRouterPendingModel" class="border border-amber-700/50 rounded p-3 space-y-2">
                  <strong class="text-xs text-gray-300">Choose a provider for {{ openRouterPendingModel.id }}</strong>
                  <p class="text-xs text-gray-500">A fixed provider preserves shared-prefix cache locality. The value saved is OpenRouter's lowercase endpoint tag.</p>
                  <div v-if="openRouterPendingLoading" class="text-xs text-gray-500">Loading provider routes…</div>
                  <div v-else class="space-y-2">
                    <label class="text-xs text-gray-400 block">Compare providers by
                      <select v-model="openRouterEndpointSort" class="hm-input">
                        <option value="throughput">Highest p50 throughput</option>
                        <option value="latency_p99">Lowest p99 latency</option>
                        <option value="input_price">Lowest input price</option>
                        <option value="cache_price">Lowest cache-read price</option>
                        <option value="quantization">Quantization</option>
                      </select>
                    </label>
                    <div class="overflow-x-auto"><table class="w-full text-xs">
                      <thead><tr class="text-left text-gray-500"><th>Pin</th><th>Provider/tag</th><th>Input</th><th>Cache read</th><th>TPS p50</th><th>Latency p50 / p99</th><th>Quant</th><th>Tools</th><th>Measured cache</th></tr></thead>
                      <tbody>
                        <tr v-for="(endpoint, index) in openRouterSortedPendingEndpoints" :key="endpoint.tag + ':' + index" :class="!endpoint.supports_tools && 'opacity-50'">
                          <td><input v-model="openRouterPendingTag" type="radio" :value="endpoint.tag" :disabled="!endpoint.supports_tools" /></td>
                          <td>{{ endpoint.provider_name }}<br /><code>{{ endpoint.tag }}</code></td>
                          <td>{{ openRouterRate(endpoint.pricing?.prompt_per_token) }}</td>
                          <td>{{ openRouterRate(endpoint.pricing?.cache_read_per_token) }}</td>
                          <td>{{ openRouterMetric(endpoint.throughput_last_30m, 'p50') }}</td>
                          <td>{{ openRouterMetric(endpoint.latency_last_30m, 'p50') }} / {{ openRouterMetric(endpoint.latency_last_30m, 'p99') }}</td>
                          <td :class="endpoint.quantization === 'fp4' && 'text-amber-400'">{{ endpoint.quantization }}</td>
                          <td>{{ endpoint.supports_tools ? 'yes' : 'no' }}</td>
                          <td>{{ openRouterEndpointCacheFact(openRouterPendingModel.id, endpoint.provider_name) }}<span v-if="openRouterRouteWarning(endpoint)" class="block text-amber-400">{{ openRouterRouteWarning(endpoint) }}</span></td>
                        </tr>
                      </tbody>
                    </table></div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="btn btn-primary text-xs" :disabled="!openRouterPendingTag || openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, openRouterPendingTag)">Add pinned</button>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, '')">Add unpinned anyway</button>
                    <button type="button" class="btn btn-ghost text-xs" @click="cancelOpenRouterPending">Cancel</button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-ghost text-xs" @click="quickAddOpenRouter" :disabled="!openRouterCatalogue?.quick_add?.length">Quick-add curated</button>
                </div>
                <div>
                  <strong class="text-xs text-gray-400">Selected order</strong>
                  <div v-for="ref in agentsConfig.auto_model_allowlist" :key="'selected:' + ref" class="mt-2 border border-gray-800 rounded p-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-mono text-xs text-gray-300">{{ ref }}</span>
                      <div class="flex gap-1">
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, -1)" @click="moveAgentAutoAllowlist(ref, -1)">Up</button>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, 1)" @click="moveAgentAutoAllowlist(ref, 1)">Down</button>
                        <button type="button" class="btn btn-ghost text-xs" @click="removeOpenRouterModel(ref)">Remove</button>
                      </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">{{ openRouterSelectedFacts(ref) }}</p>
                    <button v-if="openRouterModelMap.get(ref)" type="button" class="btn btn-ghost text-xs mt-2" @click="prepareOpenRouterModel(openRouterModelMap.get(ref))">
                      {{ openRouterPin(ref) ? 'Change pinned provider: ' + openRouterPin(ref) : 'Choose provider pin' }}
                    </button>
                    <input :value="agentsConfig.model_selection_hints?.[ref] || ''" @change="saveModelHint(ref, $event.target.value)" class="hm-input mt-2" :placeholder="'Operator hint for ' + ref" />
                  </div>
                </div>
              </div>
              <div v-else-if="agentsConfig.model === 'auto'" class="mt-3">
                <span class="block text-xs text-gray-400">Auto allowlist</span>
                <p class="text-xs text-gray-500 mt-1">Top to bottom is the agent preference order.</p>
                <div v-for="group in autoAllowlistGroups" :key="group.id" class="mt-2">
                  <strong class="text-xs text-gray-500">{{ group.label }}</strong>
                  <div class="space-y-2 mt-1">
                    <div v-for="model in group.models" :key="'allow:' + model.ref" class="text-xs text-gray-400">
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          :disabled="!agentModelAvailable(model) && !agentsConfig.auto_model_allowlist.includes(model.ref)"
                          :checked="agentsConfig.auto_model_allowlist.includes(model.ref)"
                          @change="toggleAgentAutoAllowlist(model.ref, $event)"
                          class="provider-control"
                        />
                        <span :class="!agentModelAvailable(model) && 'text-gray-600'">{{ agentModelOptionLabel(model) }}</span>
                      </label>
                      <div v-if="agentsConfig.auto_model_allowlist.includes(model.ref)" class="ml-5 mt-1 space-y-1">
                        <p v-if="model.hint_metadata?.hint || model.hint_metadata?.hint_derived" class="text-gray-500">
                          Shipped hint: {{ model.hint_metadata.hint || model.hint_metadata.hint_derived }}
                          <span v-if="model.hint_metadata.as_of">as of {{ model.hint_metadata.as_of }}</span>
                        </p>
                        <p v-if="model.hint_metadata?.scope_note" class="text-amber-400">{{ model.hint_metadata.scope_note }}</p>
                        <p v-if="model.hint_metadata?.evidence" class="text-gray-600">Evidence: {{ model.hint_metadata.evidence }}</p>
                        <p v-if="structuralFacts(model)" class="text-gray-600">Facts: {{ structuralFacts(model) }}</p>
                        <p v-if="!model.hint_metadata || Object.keys(model.hint_metadata).length === 0" class="text-amber-400">Unknown model. Add an operator hint.</p>
                        <input
                          :value="agentsConfig.model_selection_hints?.[model.ref] || ''"
                          @change="saveModelHint(model.ref, $event.target.value)"
                          class="hm-input"
                          :placeholder="'Operator hint for ' + model.ref"
                        />
                        <div class="flex gap-1">
                          <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(model.ref, -1)" @click="moveAgentAutoAllowlist(model.ref, -1)">Move up</button>
                          <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(model.ref, 1)" @click="moveAgentAutoAllowlist(model.ref, 1)">Move down</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Auxiliary model
                <select :value="auxForm.enabled ? auxForm.model : ''" @change="onAuxModelChange" class="hm-input">
                  <option value="">Off — use main model</option>
                  <optgroup v-for="group in modelGroups" :key="'aux:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <p class="text-xs text-gray-500 mt-1">Used for compaction, reflection, consolidation, and background follow-up. Its output feeds sessions and memory, so choose deliberately.</p>
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
          <p class="hidden text-xs text-gray-500 mt-3">
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

        <section aria-label="Additional providers" class="space-y-6">
        <div><h2 class="text-sm font-semibold text-gray-300">Additional providers</h2><p class="text-xs text-gray-500 mt-1">Connect compatible endpoints or Ollama. Their models appear above automatically.</p></div>
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
              <select v-model="compatibleForm.preset" @change="applyCompatiblePreset" class="hm-input">
                <option v-for="(preset, key) in (llmStatus?.openai_compatible?.preset_catalogue || {})" :key="key" :value="key">{{ preset.label }}</option>
                <option value="kimi">Kimi compatibility</option><option value="custom">Custom</option>
              </select>
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
              <section v-if="openRouterRecognized" class="llm-advanced-group">
                <header><strong>OpenRouter provider pinning</strong><span>Order uses lowercase endpoint tags, never display names. Fallbacks default off so a pin cannot silently drift.</span></header>
                <label><span class="llm-field-label">Default reasoning effort</span>
                  <select v-model="compatibleForm.openrouter.reasoning_effort" class="hm-input">
                    <option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">X-high</option><option value="max">Max</option>
                  </select>
                </label>
                <label><span class="llm-field-label">Pinned endpoint tags <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.order.join(', ')" @change="setOpenRouterList('order', $event.target.value)" class="hm-input" placeholder="alibaba" />
                </label>
                <label><span class="llm-field-label">Quantizations <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.quantizations.join(', ')" @change="setOpenRouterList('quantizations', $event.target.value)" class="hm-input" placeholder="fp8, bf16" />
                </label>
                <label><span class="llm-field-label">Route sort</span>
                  <select v-model="compatibleForm.openrouter.sort" class="hm-input"><option :value="null">OpenRouter default</option><option value="price">Price</option><option value="throughput">Throughput</option><option value="latency">Latency</option></select>
                </label>
                <label><span class="llm-field-label">Data collection</span>
                  <select v-model="compatibleForm.openrouter.data_collection" class="hm-input"><option :value="null">OpenRouter default</option><option value="deny">Deny</option><option value="allow">Allow</option></select>
                </label>
                <label class="flex items-center gap-2"><input v-model="compatibleForm.openrouter.allow_fallbacks" type="checkbox" class="provider-control" /><span class="text-xs text-amber-400">Allow fallback away from the pin</span></label>
                <p class="text-xs text-gray-500">require_parameters is always sent when tools or reasoning are present. Measured cached-token ratios appear in the selected model list after real calls.</p>
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
        </section>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({main:"",main_capability:"medium",agent_capability:"adaptive"}),n=f(""),i=["none","low","medium","high","xhigh","max"],l=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),o=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],r=j(()=>{var Ue;const w=t.value||{},G=w.model_catalogue||w.model_catalog||{},de=(et,ys,Ut)=>ys.map(na=>{var si,Wi;return{ref:et==="codex"?na:`${et}:${typeof na=="string"?na:na.name}`,name:typeof na=="string"?na:na.name,provider:et,available:!!(Ut!=null&&Ut.enabled&&(et==="codex"?Ut.configured:(si=Ut.health)!=null&&si.healthy)),unavailable_reason:Ut!=null&&Ut.enabled?Ut!=null&&Ut.configured?!((Wi=Ut==null?void 0:Ut.health)!=null&&Wi.healthy)&&et!=="codex"?"unreachable":"":"not configured":"disabled",capability:et==="codex"?"reasoning":et==="compat"?"thinking":"none"}}),Ne=[...G.codex||de("codex",o,w.codex),...G.compat||G.openai_compatible||de("compat",te.value,w.openai_compatible),...G.ollama||de("ollama",V.value,w.ollama)].map(et=>typeof et=="string"?{ref:et,name:et,provider:"codex",available:!0,capability:"reasoning"}:et);if(xt.value){const et=new Set(Ne.map(ys=>ys.ref));for(const ys of((Ue=Te.value)==null?void 0:Ue.models)||[]){const Ut=`compat:${ys.id}`;et.has(Ut)||Ne.push({ref:Ut,name:ys.name||ys.id,provider:"compat",available:!0,unavailable_reason:"",capability:ys.supports_reasoning?"reasoning":"none",efforts:ys.supported_efforts||[],agent_available:ys.agent_eligible&&!!ys.profile,agent_unavailable_reason:ys.agent_unavailable_reason||"select to auto-fill its profile"})}}const Xe=new Set(Ne.map(et=>et.ref));for(const et of[a.value.main,me.value.model,...me.value.auto_model_allowlist||[]])et&&et!=="auto"&&!Xe.has(et)&&Ne.unshift({ref:et,name:et.replace(/^(compat|ollama):/,""),provider:et.split(":")[0]||"codex",available:!1,unavailable_reason:"unavailable",capability:et.startsWith("compat:")?"thinking":et.startsWith("ollama:")?"none":"reasoning"});return Ne}),c=j(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([w,G])=>({id:w,label:G,models:r.value.filter(de=>{if(de.provider!==w)return!1;const Ne=n.value.trim().toLowerCase();return!Ne||`${de.name} ${de.ref}`.toLowerCase().includes(Ne)})})).filter(w=>w.models.length)),d=w=>w.available&&w.agent_available!==!1,u=w=>w.available?`${w.name}${w.agent_available===!1?` (${w.agent_unavailable_reason||"not agent-eligible"})`:""}`:g(w),p=j(()=>c.value.map(w=>({...w,models:w.models.filter(G=>me.value.auto_model_allowlist.includes(G.ref)||d(G))})).filter(w=>w.models.length)),m=j(()=>r.value.find(w=>w.ref===a.value.main)),h=j(()=>r.value.find(w=>w.ref===me.value.model)),g=w=>`${w.name}${w.available?"":` (${w.unavailable_reason||"unavailable"})`}`,R=j(()=>{const w=l.value.model;return w&&!o.includes(w)?[w,...o]:o}),O=j(()=>{const w=me.value.model;return w&&w!=="auto"&&!o.includes(w)?[w,...o]:o}),y={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},v=(w,G)=>!!w&&!!G&&(y[w]||[]).includes(G),b=j(()=>{const w=me.value.model;return w&&!w.includes(":")?w:null}),x=w=>!v(l.value.model,w)&&!(l.value.agent_reasoning_effort===""&&v(b.value,w)),k=w=>{const G=me.value.model;return G==="auto"?!0:!v(G||l.value.model,w)},C=j(()=>{const w=l.value.agent_reasoning_effort;return w==="auto"?null:w||l.value.reasoning_effort}),A=w=>v(w,l.value.reasoning_effort)||me.value.model===""&&v(w,C.value),_=w=>v(w,C.value),I=f({enabled:!1,model:"gpt-5.6-luna"}),U=f({unavailable_reason:null}),T=j(()=>{const w=I.value.model;return w&&!o.includes(w)?[w,...o]:o});function F(w){const G=w.target.value;I.value.enabled=G!=="",G!==""&&(I.value.model=G),G.startsWith("compat:")&&xt.value?cs(Ps(G),ts(G)).then(()=>ei()).catch(de=>Ce(de.message||"Failed to prepare OpenRouter model","error")):ei()}const Z=f(!1),W=f({codex:!1,ollama:!1,compatible:!1}),M=f(null),L=f(!1),D=f(""),le=f(null),ie=f(!1);let B=0;const Q=j(()=>{var w;return Object.entries(((w=M.value)==null?void 0:w.models)||{}).map(([G,de])=>{var Ne,Xe,Ue;return{model:G,floor:de.floor,override:de.override,effectiveBudget:(Ne=de.effective)==null?void 0:Ne.effective_budget,configuredPrimaryChars:(Xe=de.configured)==null?void 0:Xe.primary_chars,primaryChars:(Ue=de.effective)==null?void 0:Ue.primary_chars,provenance:de.provenance,clampExpiresAt:de.clamp_expires_at,densityPriorMilli:de.density_prior_milli,densityScope:de.density_scope,workloadCalibration:de.workload_calibration}})}),re=j(()=>{var w;return((w=M.value)==null?void 0:w.clamps)||[]}),J=j(()=>{var w,G;return((G=(w=M.value)==null?void 0:w.models)==null?void 0:G[l.value.model])||null}),fe=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),ne=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",max_tokens:4096,timeout:300,preset:"deepseek",model_profiles:{},context_utilization:75,openrouter:{order:[],allow_fallbacks:!1,quantizations:[],sort:null,data_collection:null,reasoning_effort:"medium",model_pins:{},catalogue_profiles:{}}}),K=f(!1),he=f(!1),ve=f(!1),ye=f(!1),_e=f(!1),$e=f(!1),E=f({configured:null}),P=f(!1),V=f([]),pe=f(""),$=f(!1),Y=f(!1),ue=f({configured:null}),H=f(!1),te=f([]),X=f(""),be=f(!1),ge=f(!1),me=f({model:"auto",auto_model_allowlist:[]}),Te=f(null),De=f(!1),je=f(""),ze=f(""),qe=f(""),We=f(!0),ot=f(!0),Ke=f(!0),ee=f(!1),we=f(null),Ae=f(""),Le=f(null),ae=f(""),Oe=f([]),Fe=f(!1),rt=f("throughput"),Zt=(w,G,de=null)=>{const Ne=w[G],Xe=de&&Ne&&typeof Ne=="object"?Ne[de]:Ne,Ue=Number(Xe);return Number.isFinite(Ue)?Ue:null},ht=j(()=>{const w=[...Oe.value],G=rt.value;return w.sort((de,Ne)=>{var Wi,xu;if(G==="quantization")return String(de.quantization).localeCompare(String(Ne.quantization));const[Xe,Ue,et]=G==="throughput"?["throughput_last_30m","p50",!0]:G==="latency_p99"?["latency_last_30m","p99",!1]:G==="cache_price"?["cache_read_per_token",null,!1]:["prompt_per_token",null,!1],ys=(Wi=de.pricing)==null?void 0:Wi[Xe],Ut=(xu=Ne.pricing)==null?void 0:xu[Xe],na=Ue?Zt(de,Xe,Ue):ys==null?null:Number(ys),si=Ue?Zt(Ne,Xe,Ue):Ut==null?null:Number(Ut);return Number.isFinite(na)?Number.isFinite(si)?et?si-na:na-si:-1:1})}),xt=j(()=>{var w,G;return!!((G=(w=t.value)==null?void 0:w.openai_compatible)!=null&&G.openrouter_recognized)}),qt=j(()=>{var w;return[...new Set((((w=Te.value)==null?void 0:w.models)||[]).map(G=>G.vendor))].sort()}),Es=j(()=>{var w;return[...new Set((((w=Te.value)==null?void 0:w.models)||[]).flatMap(G=>(G.endpoints||[]).map(de=>de.quantization)).filter(Boolean))].sort()}),da=w=>{var G;return(((G=Te.value)==null?void 0:G.measured_cache)||[]).some(de=>de.model===w.id&&de.samples>0&&de.cached_percent>0)},sa=j(()=>{var G;const w=ze.value.trim().toLowerCase();return(((G=Te.value)==null?void 0:G.models)||[]).filter(de=>{var Ne;return!(w&&!`${de.id} ${de.name} ${de.vendor}`.toLowerCase().includes(w)||qe.value&&de.vendor!==qe.value||We.value&&!de.supports_tools||ot.value&&!de.agent_eligible||Ke.value&&de.variant!=="standard"||ee.value&&!da(de)||we.value!=null&&Number((Ne=de.pricing)==null?void 0:Ne.prompt_per_token)*1e6>Number(we.value)||Ae.value&&!(de.endpoints||[]).some(Xe=>Xe.quantization===Ae.value))})}),xn=j(()=>sa.value.slice(0,100)),Ta=j(()=>sa.value.length),Vs=j(()=>{var w;return new Map((((w=Te.value)==null?void 0:w.models)||[]).map(G=>[`compat:${G.id}`,G]))}),ua=w=>w==null?"n/a":`$${(Number(w)*1e6).toFixed(3)}/M`,Ds=w=>{var G,de,Ne,Xe;return[w.vendor,w.context_length?`${Number(w.context_length).toLocaleString()} ctx`:"context unknown",`${ua((G=w.pricing)==null?void 0:G.prompt_per_token)} in`,`${ua((de=w.pricing)==null?void 0:de.completion_per_token)} out`,`${ua((Ne=w.pricing)==null?void 0:Ne.cache_read_per_token)} cache read`,`${ua((Xe=w.pricing)==null?void 0:Xe.cache_write_per_token)} cache write`,w.supports_tools?"tools":"no tools",w.supports_reasoning?"reasoning":"no reasoning",w.variant!=="standard"?w.variant:null].filter(Boolean).join(" · ")},_n=w=>{var Xe;const G=Vs.value.get(w);if(!G)return"Catalogue facts unavailable";const de=(((Xe=Te.value)==null?void 0:Xe.measured_cache)||[]).filter(Ue=>Ue.model===G.id),Ne=de.length?de.map(Ue=>`${Ue.upstream_provider}: ${Ue.cached_percent}% cached`).join(" · "):"No measured cache evidence yet";return`${Ds(G)} · ${Ne}${G.profile_conflict?" · operator profile conflicts with catalogue":""}`},qs=j(()=>te.value.map(w=>typeof w=="string"?w:w.name).filter(Boolean)),ut=()=>{var G,de,Ne;const w=(Ne=(de=(G=t.value)==null?void 0:G.openai_compatible)==null?void 0:de.preset_catalogue)==null?void 0:Ne[ne.value.preset];w&&(ne.value.base_url=w.base_url),ti()},Gs=(w,G)=>{ne.value.openrouter[w]=G.split(",").map(de=>de.trim()).filter(Boolean)},Ca=j(()=>V.value||[]),ce=j(()=>{const w=[...o,...qs.value.map(G=>`compat:${G}`),...Ca.value.map(G=>`ollama:${G.name}`)];for(const G of[me.value.model,...me.value.auto_model_allowlist||[]])G&&G!=="auto"&&!w.includes(G)&&w.unshift(G);return w}),Re=w=>w==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":w;async function Je(){try{me.value={...me.value,...await z.get("/api/agents/model")}}catch{}}async function nt(){if(!xt.value){Te.value=null,je.value="";return}De.value=!0;try{Te.value=await z.get("/api/openrouter/catalogue"),je.value=""}catch(w){je.value=w.message||"Failed to load OpenRouter catalogue"}finally{De.value=!1}}async function It(){var w;try{(w=me.value.model)!=null&&w.startsWith("compat:")&&xt.value&&await cs(Ps(me.value.model),ts(me.value.model));const G=await z.put("/api/agents/model",{model:me.value.model||null});me.value={...me.value,...G},Ce("Agent model policy saved")}catch(G){Ce(G.message||"Failed to save agent model policy","error")}}async function yt(w,G){const de=new Set(me.value.auto_model_allowlist||[]);G.target.checked?de.add(w):de.delete(w);try{const Ne=await z.put("/api/agents/model",{auto_model_allowlist:[...de]});me.value={...me.value,...Ne},Ce("Agent Auto allowlist saved")}catch(Ne){Ce(Ne.message||"Failed to save agent allowlist","error")}}async function pa(w,G){try{const de=await z.put("/api/agents/model",{auto_model_allowlist:w});me.value={...me.value,...de},Ce(G)}catch(de){Ce(de.message||"Failed to save agent allowlist","error")}}async function cs(w,G=""){const[de,...Ne]=w.split("/");if(!de||!Ne.length)throw new Error("OpenRouter model id is not namespaced");return z.post(`/api/openrouter/models/${encodeURIComponent(de)}/${encodeURIComponent(Ne.join("/"))}/select`,{provider_tag:G})}const zi=(w,G)=>{var Ne;const de=(((Ne=Te.value)==null?void 0:Ne.measured_cache)||[]).find(Xe=>Xe.model===w&&Xe.upstream_provider===G);return de?`${de.cached_percent}% cached over ${de.samples} calls`:"no measured cache evidence"},Kn=w=>w==null?"n/a":`$${(Number(w)*1e6).toFixed(4)}/M`,wn=(w,G)=>{if(w==null)return"n/a";if(typeof w=="number")return Number(w).toLocaleString();const de=w[G];return de==null?"n/a":Number(de).toLocaleString()},Jn=w=>{var Xe;const G=[];w.quantization==="fp4"&&G.push("fp4 quantization may change quality");const de=typeof w.latency_last_30m=="object"?Number((Xe=w.latency_last_30m)==null?void 0:Xe.p99):null,Ne=Number(me.value.iteration_timeout_seconds||0)*1e3;return de&&Ne&&de>Ne&&G.push("p99 exceeds the agent iteration budget"),G.join("; ")};async function Ea(w){var G;Le.value=w,ae.value=((G=ne.value.openrouter.model_pins)==null?void 0:G[w.id])||"",Fe.value=!0;try{const[de,...Ne]=w.id.split("/"),Xe=await z.get(`/api/openrouter/models/${encodeURIComponent(de)}/${encodeURIComponent(Ne.join("/"))}/endpoints`);Oe.value=Xe.endpoints||[]}catch(de){Oe.value=[],Ce(de.message||"Failed to load OpenRouter provider routes","error")}finally{Fe.value=!1}}function Aa(){Le.value=null,ae.value="",Oe.value=[]}async function Yt(w,G=""){try{await cs(w.id,G),await pa([...me.value.auto_model_allowlist,`compat:${w.id}`],G?"OpenRouter model added and provider pinned.":"OpenRouter model added unpinned."),Aa(),await Ws()}catch(de){Ce(de.message||"Failed to add OpenRouter model","error")}}const Ps=w=>w.startsWith("compat:")?w.slice(7):w,ts=w=>{var G;return((G=ne.value.openrouter.model_pins)==null?void 0:G[Ps(w)])||""},Zn=w=>pa(me.value.auto_model_allowlist.filter(G=>G!==w),"OpenRouter model removed");async function Yn(){var w;try{const G=[...me.value.auto_model_allowlist];for(const de of((w=Te.value)==null?void 0:w.quick_add)||[])await cs(Ps(de),""),G.includes(de)||G.push(de);await pa(G,"Curated OpenRouter models added"),await Ws()}catch(G){Ce(G.message||"Failed to add curated OpenRouter models","error")}}function Hi(w){const G=w.hint_metadata||{},de=[];return G.context_tokens&&de.push(`context ${Number(G.context_tokens).toLocaleString()}`),G.max_output_tokens&&de.push(`max output ${Number(G.max_output_tokens).toLocaleString()}`),G.structural_source&&de.push(`source ${G.structural_source}`),de.join("; ")}async function Qn(w,G){const de={...me.value.model_selection_hints||{}},Ne=G.trim();Ne?de[w]=Ne:delete de[w];try{const Xe=await z.put("/api/agents/model",{model_selection_hints:de});me.value={...me.value,...Xe},Ce("Model hint saved")}catch(Xe){Ce(Xe.message||"Failed to save model hint","error")}}function kn(w,G){const de=(me.value.auto_model_allowlist||[]).indexOf(w);return de>=0&&de+G>=0&&de+G<me.value.auto_model_allowlist.length}async function an(w,G){const de=[...me.value.auto_model_allowlist||[]],Ne=de.indexOf(w);if(!(Ne<0||!kn(w,G))){[de[Ne],de[Ne+G]]=[de[Ne+G],de[Ne]];try{const Xe=await z.put("/api/agents/model",{auto_model_allowlist:de});me.value={...me.value,...Xe},Ce("Agent Auto allowlist order saved")}catch(Xe){Ce(Xe.message||"Failed to reorder agent allowlist","error")}}}const Ra=f(!0),Ee=f(""),N=f({configured:null,accounts:[]}),oe=f(null),xe=f(null),Me=f(""),Pe=f(null),Ve=f(!1),Ct=f(null),pt=f(null),St=f("");let $t=null;function Ce(w,G="success"){Se(w,G==="error"?"error":"success")}function Ia(w){if(!w)return"?";const G=w/(1024*1024*1024);return G>=1?G.toFixed(1)+" GB":(w/(1024*1024)).toFixed(0)+" MB"}function Xn(w){return Number.isFinite(Number(w))?Number(w).toLocaleString():"—"}function Fr(w){return w==null?"automatic (model-derived)":Number(w).toLocaleString()+" characters"}function Oa(w){const G=new Date(w);return Number.isNaN(G.getTime())?"unknown":G.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function $r(w){return typeof w=="string"&&w.length>12?w.slice(0,8)+"…"+w.slice(-4):w}function Ur(w){return typeof w!="number"||!Number.isFinite(w)?"—":(w/1e3).toFixed(2)}function Xl(w){return w==="temporary learned clamp"?"is-clamp":w==="override"?"is-override":"is-built-in"}function Br(w){const G=l.value.context_budget_overrides[w.model];return w.floor!=null&&Number.isFinite(Number(G))&&Number(G)>w.floor}function zr(w,G){const de={...l.value.context_budget_overrides};G.target.value===""?delete de[w]:de[w]=Number(G.target.value),l.value.context_budget_overrides=de,ie.value=!0}function Hr(w){l.value.context_utilization=w.target.value===""?"":Number(w.target.value),ie.value=!0}function jr(w){const G={...l.value.context_budget_overrides};delete G[w],l.value.context_budget_overrides=G,ie.value=!0}async function Ws(){e.value=!0,await Promise.all([ss(),nn(),He(),Je(),bs(),fa()]),await nt(),e.value=!1}async function ss({preserveBasic:w=!1,preserveAdvanced:G=!1}={}){var de,Ne,Xe;try{const Ue=await z.get("/api/llm/status");t.value=Ue,s.value=!1,a.value.main=Ue.main_model||Ue.active_model||(Ue.active_provider==="compat"?`compat:${((de=Ue.openai_compatible)==null?void 0:de.model)||""}`:Ue.active_provider==="ollama"?`ollama:${((Ne=Ue.ollama)==null?void 0:Ne.model)||""}`:((Xe=Ue.codex)==null?void 0:Xe.model)||"gpt-5.6-sol"),Ue.codex&&!qi.pending()&&(w||(l.value.enabled=Ue.codex.enabled,l.value.model=Ue.codex.model||"gpt-5.6-sol",l.value.reasoning_effort=Ue.codex.reasoning_effort||"medium",l.value.agent_reasoning_effort=Ue.codex.agent_reasoning_effort||""),G||(l.value.request_timeout_seconds=Ue.codex.request_timeout_seconds??l.value.request_timeout_seconds,l.value.stream_stall_timeout_seconds=Ue.codex.stream_stall_timeout_seconds??l.value.stream_stall_timeout_seconds,l.value.retry={...l.value.retry,...Ue.codex.retry||{}},l.value.connection_pool={...l.value.connection_pool,...Ue.codex.connection_pool||{}},l.value.context_compression={...l.value.context_compression,...Ue.codex.context_compression||{}},!ie.value&&!ve.value&&(l.value.context_budget_overrides={...Ue.codex.context_budget_overrides||{}},l.value.context_utilization=Ue.codex.context_utilization??l.value.context_utilization))),Ue.ollama&&!Gi.pending()&&(w||(fe.value.enabled=Ue.ollama.enabled,fe.value.base_url=Ue.ollama.base_url||"",fe.value.model=Ue.ollama.model||"",fe.value.max_tokens=Ue.ollama.max_tokens||4096),G||(fe.value.timeout=Ue.ollama.timeout??fe.value.timeout));const et=Ue.openai_compatible;et&&!ti.pending()&&(w||(ne.value.enabled=et.enabled,ne.value.base_url=et.base_url||ne.value.base_url,ne.value.model=et.model||ne.value.model,ne.value.max_tokens=et.max_tokens||4096,ne.value.preset=et.preset||ne.value.preset),G||(ne.value.timeout=et.timeout??ne.value.timeout,ne.value.model_profiles=et.model_profiles||ne.value.model_profiles,ne.value.context_utilization=et.context_utilization??ne.value.context_utilization,ne.value.openrouter={...ne.value.openrouter,...et.openrouter||{}})),Ue.auxiliary&&(U.value=Ue.auxiliary,ei.pending()||(I.value.enabled=Ue.auxiliary.enabled,I.value.model=Ue.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),s.value=!0}}async function fa(){const w=++B;L.value=!0,D.value="";try{const G=await z.get("/api/context/windows");if(w!==B)return;M.value=G,!ve.value&&!ie.value&&(l.value.context_budget_overrides=Object.fromEntries(Object.entries(G.models||{}).filter(([,de])=>de.override!=null).map(([de,Ne])=>[de,Ne.override])),l.value.context_utilization=G.utilization??l.value.context_utilization)}catch(G){w===B&&(D.value=G.message||"Failed to load context budgets")}finally{w===B&&(L.value=!1)}}async function nn(){try{if(E.value=await z.get("/api/ollama/status"),P.value=!1,E.value.model&&(pe.value=E.value.model),E.value.configured)try{const w=await z.get("/api/ollama/models");V.value=w.models||[]}catch{V.value=[]}else if(fe.value.base_url)try{const w=await z.post("/api/ollama/probe-models",{base_url:fe.value.base_url});V.value=w.models||[]}catch{V.value=[]}}catch{P.value=!0}}async function bs(){Ra.value=!0,Ee.value="";try{N.value=await z.get("/api/codex/status")}catch(w){Ee.value=w.message||"Failed to fetch Codex status"}finally{Ra.value=!1}}async function ji(){try{a.value.main.startsWith("compat:")&&xt.value&&await cs(Ps(a.value.main),ts(a.value.main));try{await z.put("/api/llm/main-model",{model:a.value.main})}catch(w){if(!/404|not found/i.test(w.message||""))throw w;await z.post("/api/llm/switch",{model:a.value.main})}Ce("Main model saved"),await Ws()}catch(w){Ce(w.message||"Failed to save main model","error"),await ss()}}async function Vi(w){a.value.main_capability=w;const G=m.value;G&&(G.capability==="reasoning"?(l.value.reasoning_effort=w,await ds()):G.capability==="thinking"&&(await z.put("/api/openai-compatible/config",{thinking_mode:w}),Ce("Thinking mode saved")))}async function S(w){a.value.agent_capability=w;const G=h.value;(G==null?void 0:G.capability)==="reasoning"?(l.value.agent_reasoning_effort=w,await ds()):(G==null?void 0:G.capability)==="thinking"&&(await z.put("/api/agents/model",{...me.value,thinking_mode:w}),Ce("Agent thinking mode saved"))}async function q(){$.value=!0;try{const w=await z.post("/api/ollama/reload");Ce(w.configured?"Ollama reloaded":w.reason||"Ollama not configured",w.configured?"success":"error"),await Ws()}catch(w){Ce(w.message||"Reload failed","error")}finally{$.value=!1}}async function se(){Y.value=!0;try{await z.post("/api/ollama/model",{model:pe.value}),Ce("Model set to "+pe.value),await Ws()}catch(w){Ce(w.message||"Failed","error")}finally{Y.value=!1}}async function ke(){const w=fe.value.base_url;if(!w){Ce("Enter a base URL first","error");return}$e.value=!0;try{const G=await z.post("/api/ollama/probe-models",{base_url:w});V.value=G.models||[],V.value.length?(Ce(V.value.length+" model(s) found"),!fe.value.model&&V.value.length&&(fe.value.model=V.value[0].name)):Ce("No models found at "+w,"error")}catch(G){Ce(G.message||"Could not reach Ollama","error")}finally{$e.value=!1}}async function He(){try{if(ue.value=await z.get("/api/openai-compatible/status"),H.value=!1,ue.value.model&&(X.value=ue.value.model),ue.value.configured)try{const w=await z.get("/api/openai-compatible/models");te.value=w.models||[]}catch{te.value=[]}}catch{H.value=!0}}async function wt(){be.value=!0;try{const w=await z.post("/api/openai-compatible/reload");Ce(w.configured?"OpenAI-compatible reloaded":w.reason||"OpenAI-compatible not configured",w.configured?"success":"error"),await Ws()}catch(w){Ce(w.message||"Reload failed","error")}finally{be.value=!1}}async function Fs(){ge.value=!0;try{await z.post("/api/openai-compatible/model",{model:X.value}),Ce("Model set to "+X.value),await Ws()}catch(w){Ce(w.message||"Failed","error")}finally{ge.value=!1}}async function ds(){if(ve.value){qi();return}ve.value=!0;const w=nf(l.value);try{await z.put("/api/llm/codex/config",w),Ce("Codex config saved"),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),bs()])}catch(G){Ce(G.message||"Failed","error");const de=JSON.stringify(nf(l.value))!==JSON.stringify(w);await Promise.all([ss({preserveBasic:de,preserveAdvanced:!0}),bs()])}finally{ve.value=!1}}async function La(){if(ve.value)return;ve.value=!0;const w=lf(l.value);try{await z.put("/api/llm/codex/config",w),JSON.stringify({context_budget_overrides:l.value.context_budget_overrides,context_utilization:l.value.context_utilization})===JSON.stringify({context_budget_overrides:w.context_budget_overrides,context_utilization:w.context_utilization})&&(ie.value=!1),Ce("Codex advanced settings saved"),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),bs(),fa()])}catch(G){Ce(G.message||"Failed","error");const de=JSON.stringify(lf(l.value))!==JSON.stringify(w);await Promise.all([ss({preserveBasic:!0,preserveAdvanced:de}),bs(),fa()])}finally{ve.value=!1}}async function aa(){if(ye.value){Gi();return}ye.value=!0;try{const w=K.value?fe.value.api_key:null,G=E1(fe.value,{includeApiKey:w!==null});await z.put("/api/llm/ollama/config",G),Ce("Ollama config saved"),w!==null&&fe.value.api_key===w&&(fe.value.api_key="",K.value=!1),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),nn()])}catch(w){Ce(w.message||"Failed","error")}finally{ye.value=!1}}async function bu(){if(!ye.value){ye.value=!0;try{await z.put("/api/llm/ollama/config",A1(fe.value)),Ce("Ollama timeout saved"),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),nn()])}catch(w){Ce(w.message||"Failed","error")}finally{ye.value=!1}}}async function Vr(){if(_e.value){ti();return}_e.value=!0;try{const w=he.value?ne.value.api_key:null,G=T1(ne.value,{includeApiKey:w!==null});await z.put("/api/openai-compatible/config",G),Ce("OpenAI-compatible config saved"),w!==null&&ne.value.api_key===w&&(ne.value.api_key="",he.value=!1),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),He()])}catch(w){Ce(w.message||"Failed","error")}finally{_e.value=!1}}async function yu(){if(!_e.value){_e.value=!0;try{await z.put("/api/openai-compatible/config",C1(ne.value)),Ce("OpenAI-compatible endpoint settings saved"),await Promise.all([ss({preserveBasic:!0,preserveAdvanced:!0}),He()])}catch(w){Ce(w.message||"Failed","error")}finally{_e.value=!1}}}async function vg(){if(Z.value){ei();return}Z.value=!0;try{await z.put("/api/llm/auxiliary/config",I.value),Ce("Auxiliary config saved"),await ss()}catch(w){Ce(w.message||"Failed","error"),await ss()}finally{Z.value=!1}}const qi=bo(ds),ei=bo(vg),Gi=bo(aa),ti=bo(Vr),gg=()=>(qi.cancel(),ds()),bg=()=>(Gi.cancel(),aa()),yg=()=>(ti.cancel(),Vr()),xg=()=>La(),_g=()=>bu(),wg=()=>yu();async function kg(w){const G=w.account_key+":"+w.model;le.value=G;try{const de=await z.post("/api/context/windows/clear",{account_key:w.account_key,model:w.model});Ce(de.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await fa()}catch(de){Ce(de.message||"Failed to clear clamp","error"),await fa()}finally{le.value=null}}async function Sg(w){try{await z.post("/api/codex/account/"+w+"/activate"),Ce("Active account switched"),await bs()}catch(G){Ce(G.message||"Failed","error")}}async function Tg(w){oe.value=w;try{await z.post("/api/codex/account/"+w+"/refresh"),Ce("Token refreshed"),await bs()}catch(G){Ce(G.message||"Refresh failed","error")}finally{oe.value=null}}function Cg(w,G){xe.value=w,Me.value=G||""}async function Eg(w){try{await z.put("/api/codex/account/"+w+"/label",{label:Me.value}),Ce("Label updated"),xe.value=null,await bs()}catch(G){Ce(G.message||"Failed","error")}}async function Ag(w,G){if(await es({title:"Delete Codex account",message:`Delete ${G||"account #"+(w+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/codex/account/"+w),Ce("Deleted. Pool reloaded."),await bs()}catch(Ne){Ce(Ne.message||"Failed","error")}}async function Rg(){Ve.value=!0;try{const w=await z.post("/api/codex/device-code");Ct.value=w,Pe.value="pending",Ig(w)}catch(w){Ce(w.message||"Failed","error")}finally{Ve.value=!1}}async function Ig(w){$t={cancelled:!1};const G=$t;try{const de=await z.post("/api/codex/device-poll",{device_auth_id:w.device_auth_id,user_code:w.user_code,interval:w.interval});if(G.cancelled)return;pt.value=de,Pe.value="success",await Ws()}catch(de){if(G.cancelled)return;St.value=de.message||"Device login failed",Pe.value="error"}}function Og(){$t&&($t.cancelled=!0),Pe.value=null,Ct.value=null}return Qe(Ws),bt(()=>{$t&&($t.cancelled=!0),qi.cancel(),ei.cancel(),Gi.cancel(),ti.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,modelSelection:a,modelSelectorSearch:n,reasoningEfforts:i,modelCatalog:r,modelGroups:c,selectedMainModel:m,selectedAgentModel:h,modelOptionLabel:g,agentModelAvailable:d,agentModelOptionLabel:u,advancedOpen:W,codexForm:l,codexModelOptions:R,codexAgentModelOptions:O,mainEffortAllowed:x,agentEffortAllowed:k,mainModelOptionDisabled:A,agentModelOptionDisabled:_,auxForm:I,auxData:U,auxModelOptions:T,onAuxModelChange:F,savingAux:Z,saveAuxConfigDebounced:ei,ollamaForm:fe,compatibleForm:ne,savingCodex:ve,savingOllama:ye,savingCompatible:_e,probingOllama:$e,ollamaKeyDirty:K,compatibleKeyDirty:he,fetchCodexStatus:bs,ollamaStatus:E,ollamaStatusLoadFailed:P,ollamaModels:V,ollamaSelectedModel:pe,reloading:$,settingModel:Y,compatibleStatus:ue,compatibleStatusLoadFailed:H,compatibleModels:te,compatibleSelectedModel:X,reloadingCompatible:be,settingCompatibleModel:ge,applyCompatiblePreset:ut,setOpenRouterList:Gs,agentsConfig:me,compatibleAgentModels:qs,ollamaAgentModels:Ca,knownAgentModelRefs:ce,agentModelLabel:Re,saveAgentsModel:It,toggleAgentAutoAllowlist:yt,autoAllowlistGroups:p,structuralFacts:Hi,saveModelHint:Qn,canMoveAllowlist:kn,moveAgentAutoAllowlist:an,openRouterCatalogue:Te,openRouterCatalogueLoading:De,openRouterCatalogueError:je,openRouterRecognized:xt,openRouterSearch:ze,openRouterVendor:qe,openRouterVendors:qt,openRouterToolsOnly:We,openRouterEligibleOnly:ot,openRouterStandardOnly:Ke,openRouterMeasuredCacheOnly:ee,openRouterMaxPromptPrice:we,openRouterQuantization:Ae,openRouterQuantizations:Es,openRouterResults:xn,openRouterMatchCount:Ta,openRouterInlineFacts:Ds,openRouterSelectedFacts:_n,prepareOpenRouterModel:Ea,addOpenRouterModel:Yt,removeOpenRouterModel:Zn,quickAddOpenRouter:Yn,openRouterModelMap:Vs,openRouterPin:ts,openRouterPendingModel:Le,openRouterPendingTag:ae,openRouterPendingEndpoints:Oe,openRouterPendingLoading:Fe,openRouterEndpointSort:rt,openRouterSortedPendingEndpoints:ht,openRouterEndpointCacheFact:zi,openRouterRate:Kn,openRouterMetric:wn,openRouterRouteWarning:Jn,cancelOpenRouterPending:Aa,codexLoading:Ra,codexError:Ee,codexData:N,refreshing:oe,editingLabel:xe,labelValue:Me,contextWindows:M,contextWindowsLoading:L,contextWindowsError:D,contextBudgetRows:Q,activeClampRows:re,activeContextBudget:J,clearingClamp:le,contextPolicyDirty:ie,deviceState:Pe,deviceLoading:Ve,deviceInfo:Ct,deviceResult:pt,deviceError:St,fetchAll:Ws,fetchLLMStatus:ss,fetchOllamaStatus:nn,fetchCompatibleStatus:He,saveMainModel:ji,saveMainCapability:Vi,saveAgentCapability:S,reloadOllama:q,setOllamaModel:se,reloadCompatible:wt,setCompatibleModel:Fs,probeOllamaModels:ke,saveCodexConfig:ds,saveOllamaConfig:aa,saveCompatibleConfig:Vr,saveCodexAdvancedConfig:La,saveOllamaAdvancedConfig:bu,saveCompatibleAdvancedConfig:yu,saveCodexConfigDebounced:qi,saveOllamaConfigDebounced:Gi,saveCompatibleConfigDebounced:ti,saveCodexConfigNow:gg,saveOllamaConfigNow:bg,saveCompatibleConfigNow:yg,saveCodexAdvancedConfigNow:xg,saveOllamaAdvancedConfigNow:_g,saveCompatibleAdvancedConfigNow:wg,activateAccount:Sg,refreshAccount:Tg,startEditLabel:Cg,saveLabel:Eg,deleteAccount:Ag,startDeviceLogin:Rg,cancelDeviceLogin:Og,formatSize:Ia,fetchContextWindows:fa,clearContextClamp:kg,setContextOverride:zr,setContextUtilization:Hr,resetContextOverride:jr,overrideAboveFloor:Br,formatCount:Xn,formatContextCeiling:Fr,formatExpiry:Oa,shortAccountKey:$r,provenanceClass:Xl,formatDensity:Ur}}},of={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function I1(e){return of[e]||of[(e||"").toLowerCase()]||"text-gray-400"}const O1={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=j(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((C,A)=>C+Number(A||0),0)}),u=f(""),p=f(0),m=f([]),h=j(()=>m.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let R=null;async function O(){var I;const k=await Promise.allSettled(g.map(U=>z.get(U.path))),C=U=>k[U].status==="fulfilled"?k[U].value:null;t.value=C(0)||{};const A=C(1);s.value=Array.isArray(A)?A:A&&A.subsystems||[],a.value=C(2)||{},n.value=C(3)||{},i.value=C(4),l.value=C(5),o.value=C(6),r.value=C(7),c.value=C(8);const _=k.filter(U=>U.status==="rejected");if(m.value=k.flatMap((U,T)=>{var F;return U.status==="rejected"?[{...g[T],reason:((F=U.reason)==null?void 0:F.message)||"request failed"}]:[]}),p.value=m.value.length,_.length===k.length){const U=(I=_[0])==null?void 0:I.reason;u.value=(U==null?void 0:U.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",O()}let v=!1;function b(){v||(v=!0,O(),R||(R=setInterval(O,3e4)))}function x(){v&&(v=!1,R&&(clearInterval(R),R=null))}return Qe(b),rs(b),Jt(x),bt(x),{loading:e,error:u,failedCount:p,failedEndpoints:m,failedEndpointSummary:h,endpoints:g,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:I1,formatAgeSeconds:Jk}}},L1=1e4,rf=3e4;function tl(e,t){return Math.max(0,e-t)}function fc(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const N1=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],M1={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,m=0;async function h(){const L=++p;a.value=!0;try{const D=await z.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=D.availability,e.value=D.availability==="available"?D.data:null,s.value=null,n.value=Date.now()}catch(D){if(L!==p)return;s.value=D.message||"Turn-state read failed",D.status===503&&(t.value="unavailable")}L===p&&(a.value=!1)}async function g(){const L=++m;r.value=!0;try{const D=await z.get("/api/turn-state/capacity-breakers");if(L!==m)return;l.value=D.availability,i.value=D.availability==="available"?D.data:null,o.value=null,c.value=Date.now()}catch(D){if(L!==m)return;o.value=D.message||"Breaker read failed",D.status===503&&(l.value="unavailable")}L===m&&(r.value=!1)}function R(){h(),g()}const O=j(()=>e.value!==null&&tl(d.value,n.value)>rf),y=j(()=>i.value!==null&&tl(d.value,c.value)>rf),v=j(()=>O.value||y.value),b=j(()=>Math.round(tl(d.value,n.value)/1e3)),x=j(()=>Math.round(tl(d.value,c.value)/1e3));function k(L){return fc(L,d.value/1e3)}function C(L){return N1[k(L)]}const A=j(()=>{var le;const L=[...((le=e.value)==null?void 0:le.turns)||[]],D=d.value/1e3;return L.sort((ie,B)=>fc(ie,D)-fc(B,D)||(B.last_progress_at||0)-(ie.last_progress_at||0))});function _(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function I(L){if(L.state==="closed")return"—";const D=tl(d.value,c.value)/1e3,le=Math.max(0,(L.cooldown_remaining_seconds||0)-D);return le>0?`${Math.ceil(le)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function U(L){if(!L)return"";const D=Math.max(0,Math.round(d.value/1e3-L));if(D<90)return`${D}s ago`;const le=Math.round(D/60);return le<90?`${le}m ago`:`${Math.round(le/60)}h ago`}let T=null,F=null,Z=!1;function W(){Z||(Z=!0,R(),T=setInterval(R,L1),u=setInterval(()=>{d.value=Date.now()},1e3),F=lt.onReconnected(R))}function M(){Z&&(Z=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),F&&(F(),F=null))}return Qe(W),rs(W),Jt(M),bt(M),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:O,breakersStale:y,anyStale:v,turnsAgeSeconds:b,breakersAgeSeconds:x,sortedTurns:A,priorityOf:k,priorityBadge:C,breakerBadge:_,cooldownLabel:I,ageLabel:U,fetchTurns:h,fetchBreakers:g,refreshAll:R,arm:W,disarm:M}}},D1={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await z.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await es({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await z.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Qe(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},cf=e=>JSON.parse(JSON.stringify(e)),P1=(e,t)=>JSON.stringify(e)===JSON.stringify(t),F1={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,m=0,h=null;const g=(M,L)=>p&&m===M&&z.token===L,R=M=>"computer-provisioning-"+M.key,O=M=>M===null?"Unset":M===""?"Empty":JSON.stringify(M),y=M=>{const L=n.value[M.key];return M.type==="array"?String(L||"").split(/\r?\n/).map(D=>D.trim()).filter(Boolean):["integer","number"].includes(M.type)?L===""||L==null?null:Number(L):L},v=j(()=>s.value.map(M=>({...M,value:y(M)})).filter(M=>!P1(M.value,a.value[M.key]))),b=j(()=>s.value.filter(M=>M.pending_restart).map(M=>M.label)),x=j(()=>s.value.some(M=>M.apply_state==="unknown")),k=j(()=>{const M={};for(const L of s.value){const D=y(L),le=L.constraints||{};["integer","number"].includes(L.type)&&(D===null&&!L.nullable?M[L.key]="A number is required.":D!==null&&(!Number.isFinite(D)||L.type==="integer"&&!Number.isInteger(D)||le.minimum!=null&&D<le.minimum||le.maximum!=null&&D>le.maximum)&&(M[L.key]="Enter a number within the allowed range.")),L.key==="monitor_names"&&(D.length>16||new Set(D).size!==D.length||D.some(ie=>!/^[A-Za-z0-9_.-]{1,64}$/.test(ie)))&&(M[L.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return M}),C=j(()=>Object.keys(k.value).length>0);function A(M,L){n.value[M.key]=L,u.value=""}function _(){n.value=Object.fromEntries(s.value.map(M=>[M.key,M.type==="array"?a.value[M.key].join(`
`):a.value[M.key]])),r.value=!1}async function I(M,L){const[D,le]=await Promise.all([z.get("/api/config"),z.get("/api/config/meta")]);if(!g(M,L))return!1;const ie=(le.fields||[]).filter(B=>/^computer\.[^.]+$/.test(B.path)&&B.path!=="computer.enabled"&&B.sensitivity==="public"&&B.apply_mode==="restart");if(!D.computer||!ie.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=ie.map(B=>({...B,key:B.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(B=>[B.key,cf(D.computer[B.key])])),_(),h=L,i.value=!0,c.value=!1,!0}async function U(){if(!p||l.value||o.value)return;const M=++m,L=z.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await I(M,L)}catch(D){g(M,L)&&(c.value=!0,d.value=D.message||"Could not load provisioning. No changes were sent.")}finally{g(M,L)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&v.value.length&&!C.value&&(r.value=!0)}async function F(){if(!p||!i.value||!r.value||o.value||l.value||c.value||C.value||!v.value.length)return;if(h!==z.token){W(),Z();return}const M={computer:Object.fromEntries(v.value.map(ie=>[ie.key,cf(ie.value)]))},L=m,D=z.token;o.value=!0,d.value="",u.value="";let le=!1;try{if(await z.put("/api/config",M),le=!0,!g(L,D))return;await I(L,D)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(ie){g(L,D)&&(c.value=!0,r.value=!1,d.value=le?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${ie.status===400?": "+ie.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{g(L,D)&&(o.value=!1)}}function Z(){p||(p=!0,U())}function W(){p=!1,m++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,h=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Qe(Z),rs(Z),Jt(W),bt(W),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:x,changes:v,validation:k,invalid:C,fieldId:R,format:O,edit:A,discard:_,load:U,openReview:T,save:F}}},$1={components:{ComputerProvisioning:F1},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),m=f(""),h=f(null),g=f(""),R=f(!1),O=f(Date.now()),y=f(""),v=f(null);let b=0,x=null,k=!1,C=z.token,A=0,_=null,I=null,U=!1;const T=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",F=j(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),Z=j(()=>{var te;const H=Date.parse(((te=e.value.accessibility)==null?void 0:te.checked_at)||"");return c.value&&Number.isFinite(H)&&O.value-H<15e3&&O.value>=H-5e3}),W=j(()=>{var H;return Z.value?T((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),M=j(()=>{var H;return Z.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),L=j(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,te])=>`${H}: ${te}`).join(", ")),D=j(()=>{var te;const H=(te=e.value.application_provenance)==null?void 0:te.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),le=j(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),ie=j(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),B=j(()=>{var te,X;const H=Date.parse(((te=h.value)==null?void 0:te.captured_at)||"");return Number.isFinite(H)&&O.value<H+Math.min(1e4,((X=h.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Q(){g.value&&URL.revokeObjectURL(g.value),g.value="",h.value=null}function re(){b++,Q(),v.value=null,c.value=!1,_==null||_.abort(),_=null,t.value=!1,m.value="",s.value=!1,i.value=!1,l.value=!1}function J(H,te){return k&&H===b&&te===z.token}function fe(){return k&&c.value&&I===z.token&&Date.now()-u.value<15e3}function ne(H,te="mutation"){var be,ge;re(),U=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,I=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":te==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":te==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",te==="mutation"&&![401,403,404].includes(X)&&typeof((be=H.data)==null?void 0:be.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((ge=H.data)==null?void 0:ge.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function K(){if(t.value||r.value||a.value||n.value||d.value||!k)return;const H=b,te=z.token;t.value=!0,A=Date.now();const X=new AbortController;_=X;try{const be=await z.get("/api/computer",{signal:X.signal});if(!J(H,te))return;he(be)}catch(be){J(H,te)&&ne(be,"read")}finally{_===X&&(_=null,t.value=!1)}}function he(H,te=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&re(),e.value=H,u.value=Date.now(),I=z.token,c.value=!(r.value&&te!=="toggle")&&!(a.value&&te!=="stop")&&!(n.value&&te!=="pause")&&!(d.value&&te!=="recovery"),o.value="",p.value="",U=!c.value}async function ve(H){if(!fe()||r.value||a.value||n.value||d.value)return;re();const te=b,X=z.token;r.value=!0;let be=!1;try{if(await z.post("/api/computer/enabled",{enabled:H}),be=!0,!J(te,X))return;const ge=await z.get("/api/computer");J(te,X)&&he(ge,"toggle")}catch(ge){J(te,X)&&ne(ge,be?"acknowledged":"mutation")}finally{r.value=!1}}async function ye(H){if(!k||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;re();const te=b,X=z.token,be=H==="stop"?a:n;be.value=!0;let ge=!1;try{if(await z.post("/api/computer/"+H,{}),ge=!0,J(te,X)){const me=await z.get("/api/computer");J(te,X)&&he(me,H)}}catch(me){J(te,X)&&ne(me,ge?"acknowledged":"mutation")}finally{be.value=!1}}async function _e(){var be;if(!fe()||d.value||((be=e.value.backend)==null?void 0:be.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;re();const te=b,X=z.token;d.value=!0;try{const ge=await z.post("/api/computer/release_owned_input",H);J(te,X)&&he(ge,"recovery")}catch(ge){J(te,X)&&ne(ge,"mutation")}finally{d.value=!1}}async function $e(){return P(!1)}async function E(){return P(!0)}async function P(H){var Te;if(!fe()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const te={session_id:e.value.session_id,generation:e.value.session_generation};if(!te.session_id||!Number.isInteger(te.generation))return;if(H){if(m.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+te.session_id)return;te.acknowledgment=m.value}const X=H?((Te=e.value.recovery)==null?void 0:Te.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const be=b,ge=z.token;d.value=!0;let me=!1;try{const De=await z.post("/api/computer/"+X,te);me=!0,J(be,ge)&&he(De,"recovery")}catch(De){J(be,ge)&&ne(De,me?"acknowledged":"mutation")}finally{d.value=!1}}async function V(){var X;if(!fe()||s.value||!e.value.available)return;Q(),R.value=!1;const H=b,te=z.token;s.value=!0;try{const be=await z.post("/api/computer/observe",{});if(!J(H,te))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=be.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const ge=await z.getBlob("/api/computer/evidence/"+be.frame.evidence_id);if(!J(H,te))return;if(!["image/png","image/jpeg"].includes(ge.type)||ge.size>2097152||!Number.isFinite(Date.parse(be.frame.expires_at))||Date.parse(be.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");h.value=be.frame,g.value=URL.createObjectURL(ge),o.value=""}catch(be){J(H,te)&&ne(be)}finally{H===b&&(s.value=!1)}}async function pe(){if(!fe()||i.value||!e.value.available)return;v.value=null;const H=b,te=z.token;i.value=!0;try{const X=await z.post("/api/computer/export",{name:y.value});J(H,te)&&(v.value=X,o.value="")}catch(X){J(H,te)&&ne(X)}finally{H===b&&(i.value=!1)}}async function $(){if(!fe()||l.value||!v.value)return;const H=b,te=z.token,X=v.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const be=await z.getBlob("/api/computer/download/"+X.artifact_id);if(!J(H,te))return;const ge=URL.createObjectURL(be),me=document.createElement("a");me.href=ge,me.download=X.name,me.click(),setTimeout(()=>URL.revokeObjectURL(ge),1e3)}catch(be){J(H,te)&&ne(be)}finally{H===b&&(l.value=!1)}}function Y(){k||(C!==z.token&&(C=z.token,re(),u.value=0,I=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),k=!0,K(),x=setInterval(()=>{O.value=Date.now(),C!==z.token&&(C=z.token,re(),u.value=0,I=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&O.value-u.value>=15e3&&re(),h.value&&Date.parse(h.value.expires_at)<=O.value&&(Q(),R.value=!0),v.value&&Date.parse(v.value.expires_at)<=O.value&&(v.value=null),!U&&O.value-A>=5e3&&K()},500))}function ue(){k=!1,clearInterval(x),x=null,re(),c.value=!1}return Qe(Y),rs(Y),Jt(ue),bt(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:h,frameUrl:g,frameExpired:R,freshness:B,name:y,artifact:v,refresh:K,control:ye,observe:V,clearFrame:Q,exportFile:pe,download:$,toggling:r,adminReady:c,enabledLabel:T,restartSettings:ie,setEnabled:ve,recovering:d,recover:$e,reconcile:E,releaseOwnedInput:_e,reconciliationAck:m,applicationProfiles:le,attached:F,scriptIdentity:D,inputLimits:L,accessibilityLabel:W,accessibilityDetail:M}}},eg=[{id:"health",label:"Health",component:jS},{id:"resources",label:"Resources",component:VS},{id:"logs",label:"Logs",component:s1},{id:"config",label:"Config",component:m1},{id:"discord",label:"Discord",component:v1},{id:"hosts",label:"Hosts",component:y1},{id:"host-access",label:"Host Access",component:b1},{id:"api-tokens",label:"API Tokens",component:x1},{id:"llm",label:"LLM Config",component:R1},{id:"internals",label:"Internals",component:O1},{id:"turn-state",label:"Turn State",component:M1},{id:"computer",label:"Computer",component:$1},{id:"update",label:"Update",component:D1}],U1={components:{TabbedPage:Nr},setup(){return{tabs:eg}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},yo=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),B1=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...yo("Operations","operations","/operations",Vv),...yo("History","history","/history",qv),...yo("Capabilities","capabilities","/capabilities",Gv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...yo("System","system","/system",eg)],Is=yn({open:!1,query:"",selected:0});function df(){Is.query="",Is.selected=0,Is.open=!0}function mc(){Is.open=!1}function z1(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const H1={setup(){const e=Pv(),t=f(null),s=j(()=>{const i=Is.query.trim().toLowerCase();return B1.map(l=>({...l,_score:z1(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});jt(()=>Is.open,async i=>{var l;i&&(await Pt(),(l=t.value)==null||l.focus())}),jt(()=>Is.query,()=>{Is.selected=0});function a(i){mc(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),mc();return}if(i.key==="ArrowDown")i.preventDefault(),Is.selected=Math.min(Is.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Is.selected=Math.max(Is.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Is.selected];l&&a(l)}}return{state:Is,results:s,inputEl:t,go:a,onKeydown:n,closePalette:mc}},template:`
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
  `},td={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(td));const j1={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ai("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ai("path",{d:td[e.name]||td.info})])}},V1=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function uf(e){return[...e.querySelectorAll(V1)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const q1={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=uf(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||uf(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},G1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const m=j(()=>{const ie=e.value.uptime_seconds||0,B=Math.floor(ie/86400),Q=Math.floor(ie%86400/3600),re=Math.floor(ie%3600/60),J=[];return B>0&&J.push(`${B}d`),Q>0&&J.push(`${Q}h`),(J.length===0||B===0&&Q===0)&&J.push(`${re}m`),J.join(" ")}),h=j(()=>{const ie=e.value.uptime_seconds||0;return 125.66*(1-Math.min(ie/86400,1))}),g=j(()=>{const ie=e.value;return[{label:"Guilds",value:ie.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:ie.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:ie.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${ie.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:ie.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:ie.loop_count>0?"text-green-400":"",highlight:ie.loop_count>0},{label:"Agents",value:ie.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:ie.agent_count>0?`${ie.agent_count} total`:"",subColor:"text-gray-500",highlight:(ie.agent_running??0)>0},{label:"Processes",value:ie.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:ie.process_count>0?`${ie.process_count} total`:"",subColor:"text-gray-500",highlight:(ie.process_running??0)>0},{label:"Schedules",value:ie.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(ie.schedule_failing>0?`${ie.schedule_failing} failing`:"")+(ie.schedule_failing>0&&ie.schedule_paused>0?", ":"")+(ie.schedule_paused>0?`${ie.schedule_paused} paused`:"")||void 0,subColor:ie.schedule_failing>0?"text-red-400":"text-yellow-400",color:ie.schedule_failing>0?"text-red-400":"",highlight:ie.schedule_failing>0},{label:"Users",value:ie.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),R=j(()=>{const ie=e.value,B=[];return B.push({label:"Bot",status:ie.status==="online"?"ok":"warn",detail:ie.status==="online"?"Online":"Starting"}),(ie.schedule_failing||0)>0?B.push({label:"Schedules",status:"error",detail:`${ie.schedule_failing} failing`}):(ie.schedule_count||0)>0&&B.push({label:"Schedules",status:"ok",detail:`${ie.schedule_count} configured`}),(ie.loop_count||0)>0&&B.push({label:"Loops",status:"ok",detail:`${ie.loop_count} active`}),(ie.agent_running||0)>0&&B.push({label:"Agents",status:"ok",detail:`${ie.agent_running} running`}),(ie.process_running||0)>0&&B.push({label:"Processes",status:"ok",detail:`${ie.process_running} running`}),B});async function O(){try{e.value=await z.get("/api/status"),s.value=null}catch(ie){s.value=ie.message}finally{t.value=!1}}let y=0,v=0,b=0,x=0;function k(ie,B){const Q=new Set;return[...B,...ie].filter(re=>{const J=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return Q.has(J)?!1:(Q.add(J),!0)})}async function C(){const ie=++y,B=b;n.value=!0;try{const Q=await z.get("/api/audit?limit=10");if(ie!==y)return;const re=B===b?[]:a.value.filter(J=>(J._liveEpoch||0)>B);a.value=k(Q,re).slice(0,10),c.value=re.length}catch{}ie===y&&(n.value=!1)}async function A(){const ie=++v,B=x;l.value=!0;try{const Q=await z.get("/api/audit?error_only=1&limit=5");if(ie!==v)return;const re=B===x?[]:i.value.filter(J=>(J._liveErrorEpoch||0)>B);i.value=k(Q,re).slice(0,5),o.value=!1}catch{if(ie!==v)return;o.value=B===x||i.value.length===0}ie===v&&(l.value=!1)}async function _(){try{const ie=await z.get("/api/knowledge");d.value=(Array.isArray(ie)?ie:[]).reduce((B,Q)=>B+(Q.chunks||0),0)}catch{d.value=null}}async function I(){try{const ie=await z.get("/api/agents");r.value=ie.filter(B=>B.status==="running")}catch{}}async function U(){u.value={...u.value,reload:!0};try{await z.post("/api/reload"),Se.success("Config reloaded")}catch(ie){Se.error(ie.message)}u.value={...u.value,reload:!1}}async function T(){if(!await es({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const B=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await z.post("/api/sessions/clear-all");Se.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await O()}catch(Q){e.value={...e.value,session_count:B},Se.error(Q.message)}u.value={...u.value,clearSessions:!1}}async function F(){if(!await es({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const B=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await z.post("/api/loops/stop-all");Se.success(Q.result),await O()}catch(Q){e.value={...e.value,loop_count:B},Se.error(Q.message)}u.value={...u.value,stopLoops:!1}}function Z(){t.value=!0,s.value=null,O(),C(),A(),I()}let W=null,M=null,L=null;function D(ie){if(ie.payload&&ie.payload.tool_name){b+=1;const B={...ie.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(B),a.value.length>10&&a.value.pop(),c.value++,B.error&&(x+=1,B._liveErrorEpoch=x,o.value=!1,i.value.unshift(B),i.value.length>5&&i.value.pop()),setTimeout(()=>{B._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let le=null;return Qe(async()=>{await Promise.all([O(),C(),A(),I(),_()]),W=setInterval(O,15e3),M=setInterval(I,1e4),lt.subscribe("events",D),le=lt.onReconnected(()=>{C(),A()})}),bt(()=>{W&&clearInterval(W),M&&clearInterval(M),clearTimeout(L),lt.unsubscribe("events",D),le&&(le(),le=null)}),{status:e,loading:t,error:s,uptime:m,uptimeRingOffset:h,stats:g,healthIndicators:R,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:C,fetchErrors:A,fetchStatus:O,onEvent:D,formatTime:Kk,formatDuration:Fi,retry:Z,reloadConfig:U,clearSessions:T,stopAllLoops:F}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function pf(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function W1(e){if(Array.isArray(e))return e}function K1(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function J1(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Z1(e,t){return W1(e)||K1(e,t)||Y1(e,t)||J1()}function Y1(e,t){if(e){if(typeof e=="string")return pf(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?pf(e,t):void 0}}const tg=Object.entries,ff=Object.setPrototypeOf,Q1=Object.isFrozen,X1=Object.getPrototypeOf,eT=Object.getOwnPropertyDescriptor;let Cs=Object.freeze,ta=Object.seal,pi=Object.create,sg=typeof Reflect<"u"&&Reflect,sd=sg.apply,ad=sg.construct;Cs||(Cs=function(t){return t});ta||(ta=function(t){return t});sd||(sd=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});ad||(ad=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const Pa=Vt(Array.prototype.forEach),tT=Vt(Array.prototype.lastIndexOf),mf=Vt(Array.prototype.pop),oi=Vt(Array.prototype.push),sT=Vt(Array.prototype.splice),_s=Array.isArray,cl=Vt(String.prototype.toLowerCase),hc=Vt(String.prototype.toString),hf=Vt(String.prototype.match),ri=Vt(String.prototype.replace),vf=Vt(String.prototype.indexOf),aT=Vt(String.prototype.trim),nT=Vt(Number.prototype.toString),iT=Vt(Boolean.prototype.toString),gf=typeof BigInt>"u"?null:Vt(BigInt.prototype.toString),bf=typeof Symbol>"u"?null:Vt(Symbol.prototype.toString),Lt=Vt(Object.prototype.hasOwnProperty),sl=Vt(Object.prototype.toString),as=Vt(RegExp.prototype.test),Cn=lT(TypeError);function Vt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return sd(e,t,a)}}function lT(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return ad(e,s)}}function Ye(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:cl;if(ff&&ff(e,null),!_s(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(Q1(t)||(t[a]=i),n=i)}e[n]=!0}return e}function oT(e){for(let t=0;t<e.length;t++)Lt(e,t)||(e[t]=null);return e}function ps(e){const t=pi(null);for(const a of tg(e)){var s=Z1(a,2);const n=s[0],i=s[1];Lt(e,n)&&(_s(i)?t[n]=oT(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ps(i):t[n]=i)}return t}function rT(e){switch(typeof e){case"string":return e;case"number":return nT(e);case"boolean":return iT(e);case"bigint":return gf?gf(e):"0";case"symbol":return bf?bf(e):"Symbol()";case"undefined":return sl(e);case"function":case"object":{if(e===null)return sl(e);const t=e,s=va(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:sl(a)}return sl(e)}default:return sl(e)}}function va(e,t){for(;e!==null;){const a=eT(e,t);if(a){if(a.get)return Vt(a.get);if(typeof a.value=="function")return Vt(a.value)}e=X1(e)}function s(){return null}return s}function cT(e){try{return as(e,""),!0}catch{return!1}}const yf=Cs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),vc=Cs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),gc=Cs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),dT=Cs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),bc=Cs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),uT=Cs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),xf=Cs(["#text"]),_f=Cs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),yc=Cs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),wf=Cs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),xo=Cs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),pT=ta(/{{[\w\W]*|^[\w\W]*}}/g),fT=ta(/<%[\w\W]*|^[\w\W]*%>/g),mT=ta(/\${[\w\W]*/g),hT=ta(/^data-[\-\w.\u00B7-\uFFFF]+$/),vT=ta(/^aria-[\-\w]+$/),kf=ta(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),gT=ta(/^(?:\w+script|data):/i),bT=ta(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),yT=ta(/^html$/i),xT=ta(/^[a-z][.\w]*(-[.\w]+)+$/i),ma={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},_T=function(){return typeof window>"u"?null:window},wT=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Sf=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function ag(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:_T();const t=Ee=>ag(Ee);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==ma.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,m=va(p,"cloneNode"),h=va(p,"remove"),g=va(p,"nextSibling"),R=va(p,"childNodes"),O=va(p,"parentNode"),y=va(p,"shadowRoot"),v=va(p,"attributes"),b=l&&l.prototype?va(l.prototype,"nodeType"):null,x=l&&l.prototype?va(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ee=s.createElement("template");Ee.content&&Ee.content.ownerDocument&&(s=Ee.content.ownerDocument)}let k,C="",A,_=!1,I=0;const U=function(){if(I>0)throw Cn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(N){U(),I++;try{return k.createHTML(N)}finally{I--}},F=function(N){U(),I++;try{return k.createScriptURL(N)}finally{I--}},Z=function(){return _||(A=wT(u,n),_=!0),A},W=s,M=W.implementation,L=W.createNodeIterator,D=W.createDocumentFragment,le=W.getElementsByTagName,ie=a.importNode;let B=Sf();t.isSupported=typeof tg=="function"&&typeof O=="function"&&M&&M.createHTMLDocument!==void 0;const Q=pT,re=fT,J=mT,fe=hT,ne=vT,K=gT,he=bT,ve=xT;let ye=kf,_e=null;const $e=Ye({},[...yf,...vc,...gc,...bc,...xf]);let E=null;const P=Ye({},[..._f,...yc,...wf,...xo]);let V=Object.seal(pi(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),pe=null,$=null;const Y=Object.seal(pi(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,H=!0,te=!1,X=!0,be=!1,ge=!0,me=!1,Te=!1,De=!1,je=!1,ze=!1,qe=!1,We=!0,ot=!1;const Ke="user-content-";let ee=!0,we=!1,Ae={},Le=null;const ae=Ye({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Oe=null;const Fe=Ye({},["audio","video","img","source","image","track"]);let rt=null;const Zt=Ye({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),ht="http://www.w3.org/1998/Math/MathML",xt="http://www.w3.org/2000/svg",qt="http://www.w3.org/1999/xhtml";let Es=qt,da=!1,sa=null;const xn=Ye({},[ht,xt,qt],hc);let Ta=Ye({},["mi","mo","mn","ms","mtext"]),Vs=Ye({},["annotation-xml"]);const ua=Ye({},["title","style","font","a","script"]);let Ds=null;const _n=["application/xhtml+xml","text/html"],qs="text/html";let ut=null,Gs=null;const Ca=s.createElement("form"),ce=function(N){return N instanceof RegExp||N instanceof Function},Re=function(){let N=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Gs&&Gs===N)return;(!N||typeof N!="object")&&(N={}),N=ps(N),Ds=_n.indexOf(N.PARSER_MEDIA_TYPE)===-1?qs:N.PARSER_MEDIA_TYPE,ut=Ds==="application/xhtml+xml"?hc:cl,_e=Lt(N,"ALLOWED_TAGS")&&_s(N.ALLOWED_TAGS)?Ye({},N.ALLOWED_TAGS,ut):$e,E=Lt(N,"ALLOWED_ATTR")&&_s(N.ALLOWED_ATTR)?Ye({},N.ALLOWED_ATTR,ut):P,sa=Lt(N,"ALLOWED_NAMESPACES")&&_s(N.ALLOWED_NAMESPACES)?Ye({},N.ALLOWED_NAMESPACES,hc):xn,rt=Lt(N,"ADD_URI_SAFE_ATTR")&&_s(N.ADD_URI_SAFE_ATTR)?Ye(ps(Zt),N.ADD_URI_SAFE_ATTR,ut):Zt,Oe=Lt(N,"ADD_DATA_URI_TAGS")&&_s(N.ADD_DATA_URI_TAGS)?Ye(ps(Fe),N.ADD_DATA_URI_TAGS,ut):Fe,Le=Lt(N,"FORBID_CONTENTS")&&_s(N.FORBID_CONTENTS)?Ye({},N.FORBID_CONTENTS,ut):ae,pe=Lt(N,"FORBID_TAGS")&&_s(N.FORBID_TAGS)?Ye({},N.FORBID_TAGS,ut):ps({}),$=Lt(N,"FORBID_ATTR")&&_s(N.FORBID_ATTR)?Ye({},N.FORBID_ATTR,ut):ps({}),Ae=Lt(N,"USE_PROFILES")?N.USE_PROFILES&&typeof N.USE_PROFILES=="object"?ps(N.USE_PROFILES):N.USE_PROFILES:!1,ue=N.ALLOW_ARIA_ATTR!==!1,H=N.ALLOW_DATA_ATTR!==!1,te=N.ALLOW_UNKNOWN_PROTOCOLS||!1,X=N.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=N.SAFE_FOR_TEMPLATES||!1,ge=N.SAFE_FOR_XML!==!1,me=N.WHOLE_DOCUMENT||!1,je=N.RETURN_DOM||!1,ze=N.RETURN_DOM_FRAGMENT||!1,qe=N.RETURN_TRUSTED_TYPE||!1,De=N.FORCE_BODY||!1,We=N.SANITIZE_DOM!==!1,ot=N.SANITIZE_NAMED_PROPS||!1,ee=N.KEEP_CONTENT!==!1,we=N.IN_PLACE||!1,ye=cT(N.ALLOWED_URI_REGEXP)?N.ALLOWED_URI_REGEXP:kf,Es=typeof N.NAMESPACE=="string"?N.NAMESPACE:qt,Ta=Lt(N,"MATHML_TEXT_INTEGRATION_POINTS")&&N.MATHML_TEXT_INTEGRATION_POINTS&&typeof N.MATHML_TEXT_INTEGRATION_POINTS=="object"?ps(N.MATHML_TEXT_INTEGRATION_POINTS):Ye({},["mi","mo","mn","ms","mtext"]),Vs=Lt(N,"HTML_INTEGRATION_POINTS")&&N.HTML_INTEGRATION_POINTS&&typeof N.HTML_INTEGRATION_POINTS=="object"?ps(N.HTML_INTEGRATION_POINTS):Ye({},["annotation-xml"]);const oe=Lt(N,"CUSTOM_ELEMENT_HANDLING")&&N.CUSTOM_ELEMENT_HANDLING&&typeof N.CUSTOM_ELEMENT_HANDLING=="object"?ps(N.CUSTOM_ELEMENT_HANDLING):pi(null);if(V=pi(null),Lt(oe,"tagNameCheck")&&ce(oe.tagNameCheck)&&(V.tagNameCheck=oe.tagNameCheck),Lt(oe,"attributeNameCheck")&&ce(oe.attributeNameCheck)&&(V.attributeNameCheck=oe.attributeNameCheck),Lt(oe,"allowCustomizedBuiltInElements")&&typeof oe.allowCustomizedBuiltInElements=="boolean"&&(V.allowCustomizedBuiltInElements=oe.allowCustomizedBuiltInElements),be&&(H=!1),ze&&(je=!0),Ae&&(_e=Ye({},xf),E=pi(null),Ae.html===!0&&(Ye(_e,yf),Ye(E,_f)),Ae.svg===!0&&(Ye(_e,vc),Ye(E,yc),Ye(E,xo)),Ae.svgFilters===!0&&(Ye(_e,gc),Ye(E,yc),Ye(E,xo)),Ae.mathMl===!0&&(Ye(_e,bc),Ye(E,wf),Ye(E,xo))),Y.tagCheck=null,Y.attributeCheck=null,Lt(N,"ADD_TAGS")&&(typeof N.ADD_TAGS=="function"?Y.tagCheck=N.ADD_TAGS:_s(N.ADD_TAGS)&&(_e===$e&&(_e=ps(_e)),Ye(_e,N.ADD_TAGS,ut))),Lt(N,"ADD_ATTR")&&(typeof N.ADD_ATTR=="function"?Y.attributeCheck=N.ADD_ATTR:_s(N.ADD_ATTR)&&(E===P&&(E=ps(E)),Ye(E,N.ADD_ATTR,ut))),Lt(N,"ADD_URI_SAFE_ATTR")&&_s(N.ADD_URI_SAFE_ATTR)&&Ye(rt,N.ADD_URI_SAFE_ATTR,ut),Lt(N,"FORBID_CONTENTS")&&_s(N.FORBID_CONTENTS)&&(Le===ae&&(Le=ps(Le)),Ye(Le,N.FORBID_CONTENTS,ut)),Lt(N,"ADD_FORBID_CONTENTS")&&_s(N.ADD_FORBID_CONTENTS)&&(Le===ae&&(Le=ps(Le)),Ye(Le,N.ADD_FORBID_CONTENTS,ut)),ee&&(_e["#text"]=!0),me&&Ye(_e,["html","head","body"]),_e.table&&(Ye(_e,["tbody"]),delete pe.tbody),N.TRUSTED_TYPES_POLICY){if(typeof N.TRUSTED_TYPES_POLICY.createHTML!="function")throw Cn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof N.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Cn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const xe=k;k=N.TRUSTED_TYPES_POLICY;try{C=T("")}catch(Me){throw k=xe,Me}}else N.TRUSTED_TYPES_POLICY===null?(k=void 0,C=""):(k===void 0&&(k=Z()),k&&typeof C=="string"&&(C=T("")));(B.uponSanitizeElement.length>0||B.uponSanitizeAttribute.length>0)&&_e===$e&&(_e=ps(_e)),B.uponSanitizeAttribute.length>0&&E===P&&(E=ps(E)),Cs&&Cs(N),Gs=N},Je=Ye({},[...vc,...gc,...dT]),nt=Ye({},[...bc,...uT]),It=function(N){let oe=O(N);(!oe||!oe.tagName)&&(oe={namespaceURI:Es,tagName:"template"});const xe=cl(N.tagName),Me=cl(oe.tagName);return sa[N.namespaceURI]?N.namespaceURI===xt?oe.namespaceURI===qt?xe==="svg":oe.namespaceURI===ht?xe==="svg"&&(Me==="annotation-xml"||Ta[Me]):!!Je[xe]:N.namespaceURI===ht?oe.namespaceURI===qt?xe==="math":oe.namespaceURI===xt?xe==="math"&&Vs[Me]:!!nt[xe]:N.namespaceURI===qt?oe.namespaceURI===xt&&!Vs[Me]||oe.namespaceURI===ht&&!Ta[Me]?!1:!nt[xe]&&(ua[xe]||!Je[xe]):!!(Ds==="application/xhtml+xml"&&sa[N.namespaceURI]):!1},yt=function(N){oi(t.removed,{element:N});try{O(N).removeChild(N)}catch{if(h(N),!O(N))throw Cn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},pa=function(N){const oe=R?R(N):N.childNodes;if(oe){const Me=[];Pa(oe,Pe=>{oi(Me,Pe)}),Pa(Me,Pe=>{try{h(Pe)}catch{}})}const xe=v?v(N):null;if(xe)for(let Me=xe.length-1;Me>=0;--Me){const Pe=xe[Me],Ve=Pe&&Pe.name;if(typeof Ve=="string")try{N.removeAttribute(Ve)}catch{}}},cs=function(N,oe){try{oi(t.removed,{attribute:oe.getAttributeNode(N),from:oe})}catch{oi(t.removed,{attribute:null,from:oe})}if(oe.removeAttribute(N),N==="is")if(je||ze)try{yt(oe)}catch{}else try{oe.setAttribute(N,"")}catch{}},zi=function(N){const oe=v?v(N):N.attributes;if(oe)for(let xe=oe.length-1;xe>=0;--xe){const Me=oe[xe],Pe=Me&&Me.name;if(!(typeof Pe!="string"||E[ut(Pe)]))try{N.removeAttribute(Pe)}catch{}}},Kn=function(N){const oe=[N];for(;oe.length>0;){const xe=oe.pop();(b?b(xe):xe.nodeType)===ma.element&&zi(xe);const Pe=R?R(xe):xe.childNodes;if(Pe)for(let Ve=Pe.length-1;Ve>=0;--Ve)oe.push(Pe[Ve])}},wn=function(N){let oe=null,xe=null;if(De)N="<remove></remove>"+N;else{const Ve=hf(N,/^[\r\n\t ]+/);xe=Ve&&Ve[0]}Ds==="application/xhtml+xml"&&Es===qt&&(N='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+N+"</body></html>");const Me=k?T(N):N;if(Es===qt)try{oe=new d().parseFromString(Me,Ds)}catch{}if(!oe||!oe.documentElement){oe=M.createDocument(Es,"template",null);try{oe.documentElement.innerHTML=da?C:Me}catch{}}const Pe=oe.body||oe.documentElement;return N&&xe&&Pe.insertBefore(s.createTextNode(xe),Pe.childNodes[0]||null),Es===qt?le.call(oe,me?"html":"body")[0]:me?oe.documentElement:Pe},Jn=function(N){return L.call(N.ownerDocument||N,N,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Ea=function(N){var oe,xe;N.normalize();const Me=L.call(N.ownerDocument||N,N,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Pe=Me.nextNode();for(;Pe;){let Ct=Pe.data;Pa([Q,re,J],pt=>{Ct=ri(Ct,pt," ")}),Pe.data=Ct,Pe=Me.nextNode()}const Ve=(oe=(xe=N.querySelectorAll)===null||xe===void 0?void 0:xe.call(N,"template"))!==null&&oe!==void 0?oe:[];Pa(Array.from(Ve),Ct=>{Yt(Ct.content)&&Ea(Ct.content)})},Aa=function(N){const oe=x?x(N):null;return typeof oe!="string"||ut(oe)!=="form"?!1:typeof N.nodeName!="string"||typeof N.textContent!="string"||typeof N.removeChild!="function"||N.attributes!==v(N)||typeof N.removeAttribute!="function"||typeof N.setAttribute!="function"||typeof N.namespaceURI!="string"||typeof N.insertBefore!="function"||typeof N.hasChildNodes!="function"||N.nodeType!==b(N)||N.childNodes!==R(N)},Yt=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return b(N)===ma.documentFragment}catch{return!1}},Ps=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return typeof b(N)=="number"}catch{return!1}};function ts(Ee,N,oe){Pa(Ee,xe=>{xe.call(t,N,oe,Gs)})}const Zn=function(N){let oe=null;if(ts(B.beforeSanitizeElements,N,null),Aa(N))return yt(N),!0;const xe=ut(x?x(N):N.nodeName);if(ts(B.uponSanitizeElement,N,{tagName:xe,allowedTags:_e}),ge&&N.hasChildNodes()&&!Ps(N.firstElementChild)&&as(/<[/\w!]/g,N.innerHTML)&&as(/<[/\w!]/g,N.textContent)||ge&&N.namespaceURI===qt&&xe==="style"&&Ps(N.firstElementChild)||N.nodeType===ma.progressingInstruction||ge&&N.nodeType===ma.comment&&as(/<[/\w]/g,N.data))return yt(N),!0;if(pe[xe]||!(Y.tagCheck instanceof Function&&Y.tagCheck(xe))&&!_e[xe]){if(!pe[xe]&&Qn(xe)&&(V.tagNameCheck instanceof RegExp&&as(V.tagNameCheck,xe)||V.tagNameCheck instanceof Function&&V.tagNameCheck(xe)))return!1;if(ee&&!Le[xe]){const Pe=O(N),Ve=R(N);if(Ve&&Pe){const Ct=Ve.length;for(let pt=Ct-1;pt>=0;--pt){const St=we?Ve[pt]:m(Ve[pt],!0);Pe.insertBefore(St,g(N))}}}return yt(N),!0}return(b?b(N):N.nodeType)===ma.element&&!It(N)||(xe==="noscript"||xe==="noembed"||xe==="noframes")&&as(/<\/no(script|embed|frames)/i,N.innerHTML)?(yt(N),!0):(be&&N.nodeType===ma.text&&(oe=N.textContent,Pa([Q,re,J],Pe=>{oe=ri(oe,Pe," ")}),N.textContent!==oe&&(oi(t.removed,{element:N.cloneNode()}),N.textContent=oe)),ts(B.afterSanitizeElements,N,null),!1)},Yn=function(N,oe,xe){if($[oe]||We&&(oe==="id"||oe==="name")&&(xe in s||xe in Ca))return!1;const Me=E[oe]||Y.attributeCheck instanceof Function&&Y.attributeCheck(oe,N);if(!(H&&!$[oe]&&as(fe,oe))){if(!(ue&&as(ne,oe))){if(!Me||$[oe]){if(!(Qn(N)&&(V.tagNameCheck instanceof RegExp&&as(V.tagNameCheck,N)||V.tagNameCheck instanceof Function&&V.tagNameCheck(N))&&(V.attributeNameCheck instanceof RegExp&&as(V.attributeNameCheck,oe)||V.attributeNameCheck instanceof Function&&V.attributeNameCheck(oe,N))||oe==="is"&&V.allowCustomizedBuiltInElements&&(V.tagNameCheck instanceof RegExp&&as(V.tagNameCheck,xe)||V.tagNameCheck instanceof Function&&V.tagNameCheck(xe))))return!1}else if(!rt[oe]){if(!as(ye,ri(xe,he,""))){if(!((oe==="src"||oe==="xlink:href"||oe==="href")&&N!=="script"&&vf(xe,"data:")===0&&Oe[N])){if(!(te&&!as(K,ri(xe,he,"")))){if(xe)return!1}}}}}}return!0},Hi=Ye({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Qn=function(N){return!Hi[cl(N)]&&as(ve,N)},kn=function(N){ts(B.beforeSanitizeAttributes,N,null);const oe=N.attributes;if(!oe||Aa(N))return;const xe={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:E,forceKeepAttr:void 0};let Me=oe.length;for(;Me--;){const Pe=oe[Me],Ve=Pe.name,Ct=Pe.namespaceURI,pt=Pe.value,St=ut(Ve),$t=pt;let Ce=Ve==="value"?$t:aT($t);if(xe.attrName=St,xe.attrValue=Ce,xe.keepAttr=!0,xe.forceKeepAttr=void 0,ts(B.uponSanitizeAttribute,N,xe),Ce=xe.attrValue,ot&&(St==="id"||St==="name")&&vf(Ce,Ke)!==0&&(cs(Ve,N),Ce=Ke+Ce),ge&&as(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Ce)){cs(Ve,N);continue}if(St==="attributename"&&hf(Ce,"href")){cs(Ve,N);continue}if(xe.forceKeepAttr)continue;if(!xe.keepAttr){cs(Ve,N);continue}if(!X&&as(/\/>/i,Ce)){cs(Ve,N);continue}be&&Pa([Q,re,J],Xn=>{Ce=ri(Ce,Xn," ")});const Ia=ut(N.nodeName);if(!Yn(Ia,St,Ce)){cs(Ve,N);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Ct)switch(u.getAttributeType(Ia,St)){case"TrustedHTML":{Ce=T(Ce);break}case"TrustedScriptURL":{Ce=F(Ce);break}}if(Ce!==$t)try{Ct?N.setAttributeNS(Ct,Ve,Ce):N.setAttribute(Ve,Ce),Aa(N)?yt(N):mf(t.removed)}catch{cs(Ve,N)}}ts(B.afterSanitizeAttributes,N,null)},an=function(N){let oe=null;const xe=Jn(N);for(ts(B.beforeSanitizeShadowDOM,N,null);oe=xe.nextNode();)if(ts(B.uponSanitizeShadowNode,oe,null),Zn(oe),kn(oe),Yt(oe.content)&&an(oe.content),(b?b(oe):oe.nodeType)===ma.element){const Pe=y?y(oe):oe.shadowRoot;Yt(Pe)&&(Ra(Pe),an(Pe))}ts(B.afterSanitizeShadowDOM,N,null)},Ra=function(N){const oe=[{node:N,shadow:null}];for(;oe.length>0;){const xe=oe.pop();if(xe.shadow){an(xe.shadow);continue}const Me=xe.node,Ve=(b?b(Me):Me.nodeType)===ma.element,Ct=R?R(Me):Me.childNodes;if(Ct)for(let pt=Ct.length-1;pt>=0;--pt)oe.push({node:Ct[pt],shadow:null});if(Ve){const pt=x?x(Me):null;if(typeof pt=="string"&&ut(pt)==="template"){const St=Me.content;Yt(St)&&oe.push({node:St,shadow:null})}}if(Ve){const pt=y?y(Me):Me.shadowRoot;Yt(pt)&&oe.push({node:null,shadow:pt},{node:pt,shadow:null})}}};return t.sanitize=function(Ee){let N=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},oe=null,xe=null,Me=null,Pe=null;if(da=!Ee,da&&(Ee="<!-->"),typeof Ee!="string"&&!Ps(Ee)&&(Ee=rT(Ee),typeof Ee!="string"))throw Cn("dirty is not a string, aborting");if(!t.isSupported)return Ee;Te||Re(N),t.removed=[];const Ve=we&&typeof Ee!="string"&&Ps(Ee);if(Ve){const St=x?x(Ee):Ee.nodeName;if(typeof St=="string"){const $t=ut(St);if(!_e[$t]||pe[$t])throw Cn("root node is forbidden and cannot be sanitized in-place")}if(Aa(Ee))throw Cn("root node is clobbered and cannot be sanitized in-place");try{Ra(Ee)}catch($t){throw pa(Ee),$t}}else if(Ps(Ee))oe=wn("<!---->"),xe=oe.ownerDocument.importNode(Ee,!0),xe.nodeType===ma.element&&xe.nodeName==="BODY"||xe.nodeName==="HTML"?oe=xe:oe.appendChild(xe),Ra(xe);else{if(!je&&!be&&!me&&Ee.indexOf("<")===-1)return k&&qe?T(Ee):Ee;if(oe=wn(Ee),!oe)return je?null:qe?C:""}oe&&De&&yt(oe.firstChild);const Ct=Jn(Ve?Ee:oe);try{for(;Me=Ct.nextNode();)Zn(Me),kn(Me),Yt(Me.content)&&an(Me.content)}catch(St){throw Ve&&pa(Ee),St}if(Ve)return Pa(t.removed,St=>{St.element&&Kn(St.element)}),be&&Ea(Ee),Ee;if(je){if(be&&Ea(oe),ze)for(Pe=D.call(oe.ownerDocument);oe.firstChild;)Pe.appendChild(oe.firstChild);else Pe=oe;return(E.shadowroot||E.shadowrootmode)&&(Pe=ie.call(a,Pe,!0)),Pe}let pt=me?oe.outerHTML:oe.innerHTML;return me&&_e["!doctype"]&&oe.ownerDocument&&oe.ownerDocument.doctype&&oe.ownerDocument.doctype.name&&as(yT,oe.ownerDocument.doctype.name)&&(pt="<!DOCTYPE "+oe.ownerDocument.doctype.name+`>
`+pt),be&&Pa([Q,re,J],St=>{pt=ri(pt,St," ")}),k&&qe?T(pt):pt},t.setConfig=function(){let Ee=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Re(Ee),Te=!0},t.clearConfig=function(){Gs=null,Te=!1,k=A,C=""},t.isValidAttribute=function(Ee,N,oe){Gs||Re({});const xe=ut(Ee),Me=ut(N);return Yn(xe,Me,oe)},t.addHook=function(Ee,N){typeof N=="function"&&oi(B[Ee],N)},t.removeHook=function(Ee,N){if(N!==void 0){const oe=tT(B[Ee],N);return oe===-1?void 0:sT(B[Ee],oe,1)[0]}return mf(B[Ee])},t.removeHooks=function(Ee){B[Ee]=[]},t.removeAllHooks=function(){B=Sf()},t}var Tf=ag();function cu(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Wn=cu();function ng(e){Wn=e}var bl={exec:()=>null};function gt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Ss.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var Ss={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},kT=/^(?:[ \t]*(?:\n|$))+/,ST=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,TT=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ql=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,CT=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,du=/(?:[*+-]|\d{1,9}[.)])/,ig=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,lg=gt(ig).replace(/bull/g,du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),ET=gt(ig).replace(/bull/g,du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),uu=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,AT=/^[^\n]+/,pu=/(?!\s*\])(?:\\.|[^\[\]\\])+/,RT=gt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",pu).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),IT=gt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,du).getRegex(),Dr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",fu=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,OT=gt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",fu).replace("tag",Dr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),og=gt(uu).replace("hr",Ql).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Dr).getRegex(),LT=gt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",og).getRegex(),mu={blockquote:LT,code:ST,def:RT,fences:TT,heading:CT,hr:Ql,html:OT,lheading:lg,list:IT,newline:kT,paragraph:og,table:bl,text:AT},Cf=gt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ql).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Dr).getRegex(),NT={...mu,lheading:ET,table:Cf,paragraph:gt(uu).replace("hr",Ql).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Cf).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Dr).getRegex()},MT={...mu,html:gt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",fu).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:bl,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:gt(uu).replace("hr",Ql).replace("heading",` *#{1,6} *[^
]`).replace("lheading",lg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},DT=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,PT=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,rg=/^( {2,}|\\)\n(?!\s*$)/,FT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Pr=/[\p{P}\p{S}]/u,hu=/[\s\p{P}\p{S}]/u,cg=/[^\s\p{P}\p{S}]/u,$T=gt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,hu).getRegex(),dg=/(?!~)[\p{P}\p{S}]/u,UT=/(?!~)[\s\p{P}\p{S}]/u,BT=/(?:[^\s\p{P}\p{S}]|~)/u,zT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,ug=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,HT=gt(ug,"u").replace(/punct/g,Pr).getRegex(),jT=gt(ug,"u").replace(/punct/g,dg).getRegex(),pg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",VT=gt(pg,"gu").replace(/notPunctSpace/g,cg).replace(/punctSpace/g,hu).replace(/punct/g,Pr).getRegex(),qT=gt(pg,"gu").replace(/notPunctSpace/g,BT).replace(/punctSpace/g,UT).replace(/punct/g,dg).getRegex(),GT=gt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,cg).replace(/punctSpace/g,hu).replace(/punct/g,Pr).getRegex(),WT=gt(/\\(punct)/,"gu").replace(/punct/g,Pr).getRegex(),KT=gt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),JT=gt(fu).replace("(?:-->|$)","-->").getRegex(),ZT=gt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",JT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),nr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,YT=gt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",nr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),fg=gt(/^!?\[(label)\]\[(ref)\]/).replace("label",nr).replace("ref",pu).getRegex(),mg=gt(/^!?\[(ref)\](?:\[\])?/).replace("ref",pu).getRegex(),QT=gt("reflink|nolink(?!\\()","g").replace("reflink",fg).replace("nolink",mg).getRegex(),vu={_backpedal:bl,anyPunctuation:WT,autolink:KT,blockSkip:zT,br:rg,code:PT,del:bl,emStrongLDelim:HT,emStrongRDelimAst:VT,emStrongRDelimUnd:GT,escape:DT,link:YT,nolink:mg,punctuation:$T,reflink:fg,reflinkSearch:QT,tag:ZT,text:FT,url:bl},XT={...vu,link:gt(/^!?\[(label)\]\((.*?)\)/).replace("label",nr).getRegex(),reflink:gt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",nr).getRegex()},nd={...vu,emStrongRDelimAst:qT,emStrongLDelim:jT,url:gt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},eC={...nd,br:gt(rg).replace("{2,}","*").getRegex(),text:gt(nd.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},_o={normal:mu,gfm:NT,pedantic:MT},al={normal:vu,gfm:nd,breaks:eC,pedantic:XT},tC={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Ef=e=>tC[e];function ga(e,t){if(t){if(Ss.escapeTest.test(e))return e.replace(Ss.escapeReplace,Ef)}else if(Ss.escapeTestNoEncode.test(e))return e.replace(Ss.escapeReplaceNoEncode,Ef);return e}function Af(e){try{e=encodeURI(e).replace(Ss.percentDecode,"%")}catch{return null}return e}function Rf(e,t){var i;const s=e.replace(Ss.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(Ss.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(Ss.slashPipe,"|");return a}function nl(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function sC(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function If(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function aC(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var ir=class{constructor(e){kt(this,"options");kt(this,"rules");kt(this,"lexer");this.options=e||Wn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:nl(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=aC(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=nl(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:nl(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=nl(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const m=p,h=m.raw+`
`+s.join(`
`),g=this.blockquote(h);i[i.length-1]=g,a=a.substring(0,a.length-m.raw.length)+g.raw,n=n.substring(0,n.length-m.text.length)+g.text;break}else if((p==null?void 0:p.type)==="list"){const m=p,h=m.raw+`
`+s.join(`
`),g=this.list(h);i[i.length-1]=g,a=a.substring(0,a.length-p.raw.length)+g.raw,n=n.substring(0,n.length-m.raw.length)+g.raw,s=h.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),p=e.split(`
`,1)[0],m=!u.trim(),h=0;if(this.options.pedantic?(h=2,d=u.trimStart()):m?h=t[1].length+1:(h=t[2].search(this.rules.other.nonSpaceChar),h=h>4?1:h,d=u.slice(h),h+=t[1].length),m&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const O=this.rules.other.nextBulletRegex(h),y=this.rules.other.hrRegex(h),v=this.rules.other.fencesBeginRegex(h),b=this.rules.other.headingBeginRegex(h),x=this.rules.other.htmlBeginRegex(h);for(;e;){const k=e.split(`
`,1)[0];let C;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),C=p):C=p.replace(this.rules.other.tabCharGlobal,"    "),v.test(p)||b.test(p)||x.test(p)||O.test(p)||y.test(p))break;if(C.search(this.rules.other.nonSpaceChar)>=h||!p.trim())d+=`
`+C.slice(h);else{if(m||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!m&&!p.trim()&&(m=!0),c+=k+`
`,e=e.substring(k.length+1),u=C.slice(h)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,R;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(R=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!g,checked:R,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Rf(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(Rf(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=nl(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=sC(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),If(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return If(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}const m=p.slice(2,-2);return{type:"strong",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Va=class id{constructor(t){kt(this,"tokens");kt(this,"options");kt(this,"state");kt(this,"tokenizer");kt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Wn,this.options.tokenizer=this.options.tokenizer||new ir,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Ss,block:_o.normal,inline:al.normal};this.options.pedantic?(s.block=_o.pedantic,s.inline=al.pedantic):this.options.gfm&&(s.block=_o.gfm,this.options.breaks?s.inline=al.breaks:s.inline=al.gfm),this.tokenizer.rules=s}static get rules(){return{block:_o,inline:al}}static lex(t,s){return new id(s).lex(t)}static lexInline(t,s){return new id(s).inlineTokens(t)}lex(t){t=t.replace(Ss.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(Ss.tabCharGlobal,"    ").replace(Ss.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const m=t.slice(1);let h;this.options.extensions.startInline.forEach(g=>{h=g.call({lexer:this},m),typeof h=="number"&&h>=0&&(p=Math.min(p,h))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},lr=class{constructor(e){kt(this,"options");kt(this,"parser");this.options=e||Wn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(Ss.notSpaceStart))==null?void 0:i[0],n=e.replace(Ss.endingNewline,"")+`
`;return a?'<pre><code class="language-'+ga(a)+'">'+(s?n:ga(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:ga(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+ga(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ga(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Af(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ga(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Af(e);if(n===null)return ga(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ga(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ga(e.text)}},gu=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},qa=class ld{constructor(t){kt(this,"options");kt(this,"renderer");kt(this,"textRenderer");this.options=t||Wn,this.options.renderer=this.options.renderer||new lr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new gu}static parse(t,s){return new ld(s).parse(t)}static parseInline(t,s){return new ld(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},xc,Ro=(xc=class{constructor(e){kt(this,"options");kt(this,"block");this.options=e||Wn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Va.lex:Va.lexInline}provideParser(){return this.block?qa.parse:qa.parseInline}},kt(xc,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),xc),nC=class{constructor(...e){kt(this,"defaults",cu());kt(this,"options",this.setOptions);kt(this,"parse",this.parseMarkdown(!0));kt(this,"parseInline",this.parseMarkdown(!1));kt(this,"Parser",qa);kt(this,"Renderer",lr);kt(this,"TextRenderer",gu);kt(this,"Lexer",Va);kt(this,"Tokenizer",ir);kt(this,"Hooks",Ro);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new lr(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new ir(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new Ro;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];Ro.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Va.lex(e,t??this.defaults)}parser(e,t){return qa.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Va.lex:Va.lexInline,r=i.hooks?i.hooks.provideParser():e?qa.parse:qa.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ga(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},zn=new nC;function mt(e,t){return zn.parse(e,t)}mt.options=mt.setOptions=function(e){return zn.setOptions(e),mt.defaults=zn.defaults,ng(mt.defaults),mt};mt.getDefaults=cu;mt.defaults=Wn;mt.use=function(...e){return zn.use(...e),mt.defaults=zn.defaults,ng(mt.defaults),mt};mt.walkTokens=function(e,t){return zn.walkTokens(e,t)};mt.parseInline=zn.parseInline;mt.Parser=qa;mt.parser=qa.parse;mt.Renderer=lr;mt.TextRenderer=gu;mt.Lexer=Va;mt.lexer=Va.lex;mt.Tokenizer=ir;mt.Hooks=Ro;mt.parse=mt;mt.options;mt.setOptions;mt.use;mt.walkTokens;mt.parseInline;qa.parse;Va.lex;const iC={breaks:!0,gfm:!0};function Of(e){if(!e)return"";try{if(typeof mt<"u"&&mt.parse){const t=mt.parse(e,iC);return typeof Tf<"u"?Tf.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function lC(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const oC={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function rC(e){return oC[e]||"wrench"}const cC=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Lf(e){if(!e)return[];const t=e.match(cC);return t?[...new Set(t)]:[]}const dC={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=j(()=>t.value.trim().length>0&&!s.value),p=f(lt.state||"disconnected");let m=null;const h=j(()=>{const M=p.value;return M==="connected"?"Connected":M==="reconnecting"?"Reconnecting…":M==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],R=j(()=>{const M=Math.floor(l.value/4)%g.length,L=l.value;return L>3?`${g[M]} (${L}s)`:g[0]});function O(){Pt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const M=i.value;M.style.height="auto",M.style.height=Math.min(M.scrollHeight,120)+"px"}function v(M,L,D={}){const le={id:++c,role:M,content:L,timestamp:Date.now(),html:M==="bot"?Of(L):"",tools_used:D.tools_used||[],is_error:D.is_error||!1,images:M==="bot"?Lf(L):[],files:D.files||[],_showTools:!1};return e.value.push(le),O(),M==="bot"&&Pt(()=>b()),le}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const D=document.createElement("button");D.className="chat-code-copy",D.textContent="Copy",D.addEventListener("click",()=>{const le=L.querySelector("code"),ie=le?le.textContent:L.textContent;navigator.clipboard.writeText(ie).then(()=>{D.textContent="Copied!",setTimeout(()=>{D.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(D)})}function x(M){if(M===0)return!0;const L=e.value[M-1],D=e.value[M],le=new Date(L.timestamp).toDateString(),ie=new Date(D.timestamp).toDateString();return le!==ie}function k(M){const L=new Date(M),D=new Date;if(L.toDateString()===D.toDateString())return"Today";const le=new Date(D);return le.setDate(le.getDate()-1),L.toDateString()===le.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function C(M){t.value=M,Pt(()=>Z())}function A(M){window.open(M,"_blank","noopener")}function _(M){M.target.style.display="none"}function I(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function U(){r&&(clearInterval(r),r=null),l.value=0}function T(M){s.value&&(s.value=!1,U(),M.type==="chat_response"?v("bot",M.content,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]}):M.type==="chat_error"&&v("bot",M.error||"Unknown error",{is_error:!0}),Pt(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function F(M){try{const L=await z.post("/api/chat",{content:M,channel_id:o.value});v("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){v("bot",L.message||"Failed to send message",{is_error:!0})}}async function Z(){const M=t.value.trim();if(!M||s.value)return;v("user",M),t.value="",s.value=!0,I(),i.value&&(i.value.style.height="auto"),lt.connected&&lt.sendChat(M,{channelId:o.value})||(await F(M),s.value=!1,U()),Pt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}async function W(){a.value="";try{if(!o.value){const L=await z.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const M=await z.get("/api/sessions/"+encodeURIComponent(o.value));if(M&&M.messages&&M.messages.length>0){for(const L of M.messages){const D=L.role==="user"?"user":"bot";let le=L.content||"";if(D==="user"){const B=le.match(/^\[.*?\]:\s*/);B&&(le=le.slice(B[0].length))}if(!le.trim())continue;const ie={id:++c,role:D,content:le,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:D==="bot"?Of(le):"",tools_used:[],is_error:!1,images:D==="bot"?Lf(le):[],files:[],_showTools:!1};e.value.push(ie)}Pt(()=>{O(),b()})}}catch(M){M&&M.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Se.error(a.value))}}return Qe(()=>{lt.subscribe("chat",T),p.value=lt.state||"disconnected",m=lt.onState(M=>{p.value=M}),W(),Pt(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}),bt(()=>{lt.unsubscribe("chat",T),m&&(m(),m=null),U()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:h,typingText:R,suggestions:d,send:Z,autoResize:y,formatTime:lC,formatDate:k,showDateSeparator:x,useSuggestion:C,openImage:A,onImageError:_,getToolIcon:rC,loadHistory:W}}},uC={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),m=f(!1),h=j(()=>e.value==="custom"),g=j(()=>[...i.value,...l.value]),R=j(()=>l.value.includes(e.value)),O=j(()=>{var A;return h.value?t.value||"Odin":((A=n.value[e.value])==null?void 0:A.name)||e.value}),y=j(()=>{var A;return h.value?s.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.identity)||""}),v=j(()=>{var A;return h.value?a.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.voice)||""});async function b(){d.value=!0;try{const A=await z.get("/api/personality");e.value=A.preset||"odin",t.value=A.custom_name||"",s.value=A.custom_identity||"",a.value=A.custom_voice||"",n.value=A.presets||{},i.value=A.builtin_presets||[],l.value=A.user_presets||[]}catch(A){c.value=A.message}finally{d.value=!1}}async function x(){o.value=!0,c.value=null,r.value=!1;try{await z.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(A){c.value=A.message}finally{o.value=!1}}async function k(){const A=u.value.trim();if(A){m.value=!0,c.value=null;try{await z.post("/api/personality/presets",{name:A,display_name:O.value,identity:y.value,voice:v.value}),p.value=!1,u.value="",await b(),e.value=A.toLowerCase().replace(/ /g,"_")}catch(_){c.value=_.message}finally{m.value=!1}}}async function C(){if(await es({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await z.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(_){c.value=_.message}}}return Qe(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:g,isCustom:h,isUserPreset:R,previewName:O,previewIdentity:y,previewVoice:v,saving:o,saved:r,error:c,loading:d,save:x,showSavePreset:p,newPresetName:u,savingPreset:m,saveAsPreset:k,deletePreset:C,builtinPresets:i,userPresets:l}},template:`
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
  `},pC={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,m=null;function h(){return p+=1,m==null||m.abort(),m=null,p}function g(x,k,C){return typeof z.postWithOptions=="function"?z.postWithOptions(x,k,{signal:C}):z.post(x,k)}async function R(){var C,A,_;a.value=!0,i.value="",l.value="Saving setup…";const x={},k=!!s.value.trim();t.value.trim()&&(x.web_api_token=t.value.trim()),s.value.trim()&&(x.discord_token=s.value.trim());try{const I=z.post("/api/setup/complete",x);t.value="",s.value="";const U=await I,T=((C=U.discord)==null?void 0:C.state)||U.discord_status;if(T==="failed"?(i.value=((A=U.discord)==null?void 0:A.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):T==="connecting"?l.value="Saved. Connecting Discord…":T==="ready"?l.value="Saved. Discord ready.":k?l.value="Saved. Discord token stored; attachment status is pending.":l.value=U.message||"Setup saved. Ready to sign in.",(_=U.restart_required)!=null&&_.length){const F=U.message||`Restart Odin to apply: ${U.restart_required.join(", ")}`;l.value.includes(F)||(l.value+=` ${F}`)}n.value=!0}catch(I){i.value=I.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function O(){const x=h(),k=typeof AbortController=="function"?new AbortController:null;m=k,o.value=!0,u.value="";try{const C=await g("/api/codex/device-code",void 0,k==null?void 0:k.signal);if(x!==p)return;c.value=C,r.value="pending";const A=await g("/api/codex/device-poll",{device_auth_id:C.device_auth_id,user_code:C.user_code,interval:C.interval},k==null?void 0:k.signal);if(x!==p)return;d.value=A||{},r.value="ready"}catch(C){x===p&&(C==null?void 0:C.name)!=="AbortError"&&(u.value=C.message||"Device sign-in failed.",r.value="failed")}finally{x===p&&(o.value=!1,m=null)}}function y(){h(),o.value=!1,b()}function v(){var x;(x=e.onComplete)==null||x.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return bt(()=>{h()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:R,onComplete:v,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:O,cancelDeviceLogin:y,clearDeviceState:b}}},Ot=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),hg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:G1,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:dC,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:cS,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bS,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:US,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:uC,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:U1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Ot("/operations","live")},{path:"/agents",redirect:Ot("/operations","agents")},{path:"/loops",redirect:Ot("/operations","loops")},{path:"/processes",redirect:Ot("/operations","processes")},{path:"/schedules",redirect:Ot("/operations","schedules")},{path:"/audit",redirect:Ot("/history","audit")},{path:"/sessions",redirect:Ot("/history","sessions")},{path:"/traces",redirect:Ot("/history","traces")},{path:"/usage",redirect:Ot("/history","usage")},{path:"/tools",redirect:Ot("/capabilities","tools")},{path:"/skills",redirect:Ot("/capabilities","skills")},{path:"/mcp",redirect:Ot("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Ot("/capabilities","knowledge")},{path:"/memory",redirect:Ot("/capabilities","memory")},{path:"/learned",redirect:Ot("/capabilities","learned")},{path:"/health",redirect:Ot("/system","health")},{path:"/resources",redirect:Ot("/system","resources")},{path:"/logs",redirect:Ot("/system","logs")},{path:"/config",redirect:Ot("/system","config")},{path:"/host-access",redirect:Ot("/system","host-access")},{path:"/hosts",redirect:Ot("/system","hosts")},{path:"/internals",redirect:Ot("/system","internals")}],yl=Pk({history:mk(),routes:hg});yl.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const fC={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{z.setPersist(n.value),await z.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},mC={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let m=null;const h=f("starting"),g=f(""),R=hg.filter(B=>B.meta),O=j(()=>["Workspace","Operate","Observe","Manage"].map(B=>({name:B,routes:R.filter(Q=>Q.meta.section===B)})).filter(B=>B.routes.length)),y=j(()=>{var B;return((B=yl.currentRoute.value.meta)==null?void 0:B.label)||"Odin"}),v=j(()=>{var B;return((B=yl.currentRoute.value.meta)==null?void 0:B.section)||"Management"}),b=j(()=>{var B;return((B=yl.currentRoute.value.meta)==null?void 0:B.description)||"Management console"});function x(){lt.disconnect(),M&&(clearInterval(M),M=null)}z.onSessionExpired=()=>{t.value=!0,x(),z.setToken(""),e.value="login"};function k(B){var Q;if((B.ctrlKey||B.metaKey)&&B.key.toLowerCase()==="k"){e.value==="ready"&&(B.preventDefault(),df());return}if(a.value&&B.key==="Tab"){const re=[...((Q=n.value)==null?void 0:Q.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(re.length){const J=re[0],fe=re[re.length-1];if(B.shiftKey&&(document.activeElement===J||!n.value.contains(document.activeElement))){B.preventDefault(),fe.focus();return}if(!B.shiftKey&&(document.activeElement===fe||!n.value.contains(document.activeElement))){B.preventDefault(),J.focus();return}}}if(B.key==="Escape"&&a.value){a.value=!1,B.preventDefault();return}if(B.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(B.target.tagName)){B.preventDefault();const re=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');re&&re.focus()}}function C(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function A(){try{const B=await z.get("/api/setup/status");if(B.mode==="pending"||B.needed===!0)return x(),e.value="setup",!0}catch(B){B==null||B.name}return!1}Qe(async()=>{if(document.addEventListener("keydown",k),o=window.matchMedia("(max-width: 900px)"),C(),o.addEventListener("change",C),await A())return;const B=await z.check();B.ok?(e.value="ready",le()):B.needsAuth?e.value="login":(e.value="ready",le())});function _(){t.value=!1,e.value="ready",le()}async function I(){if(await A())return;const B=await z.check();B.ok?(e.value="ready",le()):B.needsAuth?e.value="login":(e.value="ready",le())}async function U(){x(),e.value="login",await z.logout()}function T(){s.value=!s.value}function F(){a.value=!a.value}jt(a,async B=>{var Q,re;if(B)r=document.activeElement,await Pt(),(re=(Q=n.value)==null?void 0:Q.querySelector(".nav-item"))==null||re.focus();else if(r!=null&&r.isConnected){const J=r;r=null,requestAnimationFrame(()=>J.focus())}});const Z=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function W(B,Q="info",re=3e3){p.value={text:B,level:Q},clearTimeout(m),m=setTimeout(()=>{p.value=null},re)}let M=null,L=!1,D=[];function le(){for(const B of D)B();D=[lt.onStatus(B=>{c.value=B}),lt.onLatencyChange(B=>{u.value=B}),lt.onState((B,Q)=>{d.value=B,B==="connected"?(L&&W("Connection restored","success"),L=!0):B==="reconnecting"&&Q.attempt===1&&W("Connection lost — reconnecting…","warn")})],lt.connect(),ie(),M&&clearInterval(M),M=setInterval(ie,15e3)}async function ie(){try{const B=await z.get("/api/status");h.value=B.status==="online"?"online":"starting";const Q=B.uptime_seconds||0,re=Math.floor(Q/3600),J=Math.floor(Q%3600/60);g.value=`${re}h ${J}m uptime`}catch{h.value="offline",g.value=""}}return bt(()=>{M&&clearInterval(M);for(const B of D)B();D=[],lt.disconnect(),document.removeEventListener("keydown",k),o==null||o.removeEventListener("change",C)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Z,wsToast:p,botStatus:h,botUptime:g,navRoutes:R,navGroups:O,currentPage:y,currentSection:v,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:_,onSetupComplete:I,logout:U,toggleSidebar:T,toggleMobileNavigation:F,openPalette:df}}},sn=Wo(mC);sn.component("odin-icon",j1);sn.component("login-screen",fC);sn.component("setup-page",pC);sn.component("toast-container",Aw);sn.component("confirm-host",Rw);sn.component("command-palette",H1);sn.directive("modal-focus",q1);sn.use(yl);sn.mount("#app");
