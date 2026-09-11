var Nv=Object.defineProperty;var Dv=(e,t,s)=>t in e?Nv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var vt=(e,t,s)=>Dv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Pv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Al("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new $d(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Al("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new $d((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Al((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Al?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Al extends Error{constructor(t){super(t),this.name="AuthError"}}class $d extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Mv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const B=new Pv,st=new Mv(B);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ls(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ze={},Yn=[],Xt=()=>{},Wn=()=>!1,Cn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Po=e=>e.startsWith("onUpdate:"),Je=Object.assign,Ec=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Fv=Object.prototype.hasOwnProperty,rt=(e,t)=>Fv.call(e,t),Ie=Array.isArray,Qn=e=>yi(e)==="[object Map]",En=e=>yi(e)==="[object Set]",Ud=e=>yi(e)==="[object Date]",$v=e=>yi(e)==="[object RegExp]",Pe=e=>typeof e=="function",He=e=>typeof e=="string",os=e=>typeof e=="symbol",ot=e=>e!==null&&typeof e=="object",Ac=e=>(ot(e)||Pe(e))&&Pe(e.then)&&Pe(e.catch),Jp=Object.prototype.toString,yi=e=>Jp.call(e),Uv=e=>yi(e).slice(8,-1),Mo=e=>yi(e)==="[object Object]",Fo=e=>He(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Oa=Ls(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Bv=Ls("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),$o=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Hv=/-\w/g,mt=$o(e=>e.replace(Hv,t=>t.slice(1).toUpperCase())),zv=/\B([A-Z])/g,ks=$o(e=>e.replace(zv,"-$1").toLowerCase()),An=$o(e=>e.charAt(0).toUpperCase()+e.slice(1)),Xn=$o(e=>e?`on${An(e)}`:""),qt=(e,t)=>!Object.is(e,t),ei=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Zp=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Uo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},ao=e=>{const t=He(e)?Number(e):NaN;return isNaN(t)?e:t};let Bd;const Bo=()=>Bd||(Bd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function jv(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Vv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",qv=Ls(Vv);function gl(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=He(a)?Yp(a):gl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(He(e)||ot(e))return e}const Gv=/;(?![^(]*\))/g,Kv=/:([^]+)/,Wv=/\/\*[^]*?\*\//g;function Yp(e){const t={};return e.replace(Wv,"").split(Gv).forEach(s=>{if(s){const a=s.split(Kv);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function bl(e){let t="";if(He(e))t=e;else if(Ie(e))for(let s=0;s<e.length;s++){const a=bl(e[s]);a&&(t+=a+" ")}else if(ot(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Jv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!He(t)&&(e.class=bl(t)),s&&(e.style=gl(s)),e}const Zv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Yv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Qv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Xv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",eg=Ls(Zv),tg=Ls(Yv),sg=Ls(Qv),ag=Ls(Xv),ng="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",ig=Ls(ng);function Qp(e){return!!e||e===""}function lg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Pa(e[a],t[a]);return s}function Pa(e,t){if(e===t)return!0;let s=Ud(e),a=Ud(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=os(e),a=os(t),s||a)return e===t;if(s=Ie(e),a=Ie(t),s||a)return s&&a?lg(e,t):!1;if(s=ot(e),a=ot(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Pa(e[l],t[l]))return!1}}return String(e)===String(t)}function Ho(e,t){return e.findIndex(s=>Pa(s,t))}const Xp=e=>!!(e&&e.__v_isRef===!0),ef=e=>He(e)?e:e==null?"":Ie(e)||ot(e)&&(e.toString===Jp||!Pe(e.toString))?Xp(e)?ef(e.value):JSON.stringify(e,tf,2):String(e),tf=(e,t)=>Xp(t)?tf(e,t.value):Qn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[pr(a,i)+" =>"]=n,s),{})}:En(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>pr(s))}:os(t)?pr(t):ot(t)&&!Ie(t)&&!Mo(t)?String(t):t,pr=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function og(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let zt;class Rc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&zt&&(zt.active?(this.parent=zt,this.index=(zt.scopes||(zt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=zt;try{return zt=this,t()}finally{zt=s}}}on(){++this._on===1&&(this.prevScope=zt,zt=this)}off(){if(this._on>0&&--this._on===0){if(zt===this)zt=this.prevScope;else{let t=zt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function rg(e){return new Rc(e)}function sf(){return zt}function cg(e,t=!1){zt&&zt.cleanups.push(e)}let gt;const fr=new WeakSet;class Zi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,zt&&(zt.active?zt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,fr.has(this)&&(fr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||nf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Hd(this),lf(this);const t=gt,s=Zs;gt=this,Zs=!0;try{return this.fn()}finally{of(this),gt=t,Zs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Lc(t);this.deps=this.depsTail=void 0,Hd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?fr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Hr(this)&&this.run()}get dirty(){return Hr(this)}}let af=0,Bi,Hi;function nf(e,t=!1){if(e.flags|=8,t){e.next=Hi,Hi=e;return}e.next=Bi,Bi=e}function Ic(){af++}function Oc(){if(--af>0)return;if(Hi){let t=Hi;for(Hi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Bi;){let t=Bi;for(Bi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function lf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function of(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Lc(a),dg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Hr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(rf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function rf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Yi)||(e.globalVersion=Yi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Hr(e))))return;e.flags|=2;const t=e.dep,s=gt,a=Zs;gt=e,Zs=!0;try{lf(e);const n=e.fn(e._value);(t.version===0||qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{gt=s,Zs=a,of(e),e.flags&=-3}}function Lc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Lc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function dg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function ug(e,t){e.effect instanceof Zi&&(e=e.effect.fn);const s=new Zi(e);t&&Je(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function pg(e){e.effect.stop()}let Zs=!0;const cf=[];function Ma(){cf.push(Zs),Zs=!1}function Fa(){const e=cf.pop();Zs=e===void 0?!0:e}function Hd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=gt;gt=void 0;try{t()}finally{gt=s}}}let Yi=0;class fg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class zo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!gt||!Zs||gt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==gt)s=this.activeLink=new fg(gt,this),gt.deps?(s.prevDep=gt.depsTail,gt.depsTail.nextDep=s,gt.depsTail=s):gt.deps=gt.depsTail=s,df(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=gt.depsTail,s.nextDep=void 0,gt.depsTail.nextDep=s,gt.depsTail=s,gt.deps===s&&(gt.deps=a)}return s}trigger(t){this.version++,Yi++,this.notify(t)}notify(t){Ic();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Oc()}}}function df(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)df(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const no=new WeakMap,gn=Symbol(""),zr=Symbol(""),Qi=Symbol("");function ns(e,t,s){if(Zs&&gt){let a=no.get(e);a||no.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new zo),n.map=a,n.key=s),n.track()}}function Ca(e,t,s,a,n,i){const l=no.get(e);if(!l){Yi++;return}const o=r=>{r&&r.trigger()};if(Ic(),t==="clear")l.forEach(o);else{const r=Ie(e),c=r&&Fo(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(gn)),Qn(e)&&o(l.get(zr)));break;case"delete":r||(o(l.get(gn)),Qn(e)&&o(l.get(zr)));break;case"set":Qn(e)&&o(l.get(gn));break}}Oc()}function hg(e,t){const s=no.get(e);return s&&s.get(t)}function $n(e){const t=tt(e);return t===e?t:(ns(t,"iterate",Qi),Ts(e)?t:t.map(Qs))}function jo(e){return ns(e=tt(e),"iterate",Qi),e}function ca(e,t){return ua(e)?oi(La(e)?Qs(t):t):Qs(t)}const mg={__proto__:null,[Symbol.iterator](){return hr(this,Symbol.iterator,e=>ca(this,e))},concat(...e){return $n(this).concat(...e.map(t=>Ie(t)?$n(t):t))},entries(){return hr(this,"entries",e=>(e[1]=ca(this,e[1]),e))},every(e,t){return ba(this,"every",e,t,void 0,arguments)},filter(e,t){return ba(this,"filter",e,t,s=>s.map(a=>ca(this,a)),arguments)},find(e,t){return ba(this,"find",e,t,s=>ca(this,s),arguments)},findIndex(e,t){return ba(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ba(this,"findLast",e,t,s=>ca(this,s),arguments)},findLastIndex(e,t){return ba(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ba(this,"forEach",e,t,void 0,arguments)},includes(...e){return mr(this,"includes",e)},indexOf(...e){return mr(this,"indexOf",e)},join(e){return $n(this).join(e)},lastIndexOf(...e){return mr(this,"lastIndexOf",e)},map(e,t){return ba(this,"map",e,t,void 0,arguments)},pop(){return Si(this,"pop")},push(...e){return Si(this,"push",e)},reduce(e,...t){return zd(this,"reduce",e,t)},reduceRight(e,...t){return zd(this,"reduceRight",e,t)},shift(){return Si(this,"shift")},some(e,t){return ba(this,"some",e,t,void 0,arguments)},splice(...e){return Si(this,"splice",e)},toReversed(){return $n(this).toReversed()},toSorted(e){return $n(this).toSorted(e)},toSpliced(...e){return $n(this).toSpliced(...e)},unshift(...e){return Si(this,"unshift",e)},values(){return hr(this,"values",e=>ca(this,e))}};function hr(e,t,s){const a=jo(e),n=a[t]();return a!==e&&!Ts(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const vg=Array.prototype;function ba(e,t,s,a,n,i){const l=jo(e),o=l!==e&&!Ts(e),r=l[t];if(r!==vg[t]){const u=r.apply(e,i);return o?Qs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ca(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function zd(e,t,s,a){const n=jo(e),i=n!==e&&!Ts(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ca(e,c)),s.call(this,c,ca(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ca(e,r):r}function mr(e,t,s){const a=tt(e);ns(a,"iterate",Qi);const n=a[t](...s);return(n===-1||n===!1)&&yl(s[0])?(s[0]=tt(s[0]),a[t](...s)):n}function Si(e,t,s=[]){Ma(),Ic();const a=tt(e)[t].apply(e,s);return Oc(),Fa(),a}const gg=Ls("__proto__,__v_isRef,__isVue"),uf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function bg(e){os(e)||(e=String(e));const t=tt(this);return ns(t,"has",e),t.hasOwnProperty(e)}class pf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?bf:gf:i?vf:mf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ie(t);if(!n){let r;if(l&&(r=mg[s]))return r;if(s==="hasOwnProperty")return bg}const o=Reflect.get(t,s,$t(t)?t:a);if((os(s)?uf.has(s):gg(s))||(n||ns(t,"get",s),i))return o;if($t(o)){const r=l&&Fo(s)?o:o.value;return n&&ot(r)?io(r):r}return ot(o)?n?io(o):an(o):o}}class ff extends pf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ie(t)&&Fo(s);if(!this._isShallow){const c=ua(i);if(!Ts(a)&&!ua(a)&&(i=tt(i),a=tt(a)),!l&&$t(i)&&!$t(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:rt(t,s),r=Reflect.set(t,s,a,$t(t)?t:n);return t===tt(n)&&(o?qt(a,i)&&Ca(t,"set",s,a):Ca(t,"add",s,a)),r}deleteProperty(t,s){const a=rt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ca(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!os(s)||!uf.has(s))&&ns(t,"has",s),a}ownKeys(t){return ns(t,"iterate",Ie(t)?"length":gn),Reflect.ownKeys(t)}}class hf extends pf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const yg=new ff,xg=new hf,_g=new ff(!0),wg=new hf(!0),jr=e=>e,Rl=e=>Reflect.getPrototypeOf(e);function kg(e,t,s){return function(...a){const n=this.__v_raw,i=tt(n),l=Qn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?jr:t?oi:Qs;return!t&&ns(i,"iterate",r?zr:gn),Je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Il(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Sg(e,t){const s={get(n){const i=this.__v_raw,l=tt(i),o=tt(n);e||(qt(n,o)&&ns(l,"get",n),ns(l,"get",o));const{has:r}=Rl(l),c=t?jr:e?oi:Qs;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ns(tt(n),"iterate",gn),n.size},has(n){const i=this.__v_raw,l=tt(i),o=tt(n);return e||(qt(n,o)&&ns(l,"has",n),ns(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=tt(o),c=t?jr:e?oi:Qs;return!e&&ns(r,"iterate",gn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Je(s,e?{add:Il("add"),set:Il("set"),delete:Il("delete"),clear:Il("clear")}:{add(n){const i=tt(this),l=Rl(i),o=tt(n),r=!t&&!Ts(n)&&!ua(n)?o:n;return l.has.call(i,r)||qt(n,r)&&l.has.call(i,n)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Ca(i,"add",r,r)),this},set(n,i){!t&&!Ts(i)&&!ua(i)&&(i=tt(i));const l=tt(this),{has:o,get:r}=Rl(l);let c=o.call(l,n);c||(n=tt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?qt(i,d)&&Ca(l,"set",n,i):Ca(l,"add",n,i),this},delete(n){const i=tt(this),{has:l,get:o}=Rl(i);let r=l.call(i,n);r||(n=tt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ca(i,"delete",n,void 0),c},clear(){const n=tt(this),i=n.size!==0,l=n.clear();return i&&Ca(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=kg(n,e,t)}),s}function Vo(e,t){const s=Sg(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(rt(s,n)&&n in a?s:a,n,i)}const Tg={get:Vo(!1,!1)},Cg={get:Vo(!1,!0)},Eg={get:Vo(!0,!1)},Ag={get:Vo(!0,!0)},mf=new WeakMap,vf=new WeakMap,gf=new WeakMap,bf=new WeakMap;function Rg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function an(e){return ua(e)?e:qo(e,!1,yg,Tg,mf)}function Nc(e){return qo(e,!1,_g,Cg,vf)}function io(e){return qo(e,!0,xg,Eg,gf)}function Ig(e){return qo(e,!0,wg,Ag,bf)}function qo(e,t,s,a,n){if(!ot(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Rg(Uv(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function La(e){return ua(e)?La(e.__v_raw):!!(e&&e.__v_isReactive)}function ua(e){return!!(e&&e.__v_isReadonly)}function Ts(e){return!!(e&&e.__v_isShallow)}function yl(e){return e?!!e.__v_raw:!1}function tt(e){const t=e&&e.__v_raw;return t?tt(t):e}function yf(e){return!rt(e,"__v_skip")&&Object.isExtensible(e)&&Zp(e,"__v_skip",!0),e}const Qs=e=>ot(e)?an(e):e,oi=e=>ot(e)?io(e):e;function $t(e){return e?e.__v_isRef===!0:!1}function f(e){return xf(e,!1)}function Dc(e){return xf(e,!0)}function xf(e,t){return $t(e)?e:new Og(e,t)}class Og{constructor(t,s){this.dep=new zo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:tt(t),this._value=s?t:Qs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Ts(t)||ua(t);t=a?t:tt(t),qt(t,s)&&(this._rawValue=t,this._value=a?t:Qs(t),this.dep.trigger())}}function Lg(e){e.dep&&e.dep.trigger()}function da(e){return $t(e)?e.value:e}function Ng(e){return Pe(e)?e():da(e)}const Dg={get:(e,t,s)=>t==="__v_raw"?e:da(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return $t(n)&&!$t(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Pc(e){return La(e)?e:new Proxy(e,Dg)}class Pg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new zo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function _f(e){return new Pg(e)}function Mg(e){const t=Ie(e)?new Array(e.length):{};for(const s in e)t[s]=wf(e,s);return t}class Fg{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=tt(t);let n=!0,i=t;if(!Ie(t)||os(this._key)||!Fo(this._key))do n=!yl(i)||Ts(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=da(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&$t(this._raw[this._key])){const s=this._object[this._key];if($t(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return hg(this._raw,this._key)}}class $g{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Ug(e,t,s){return $t(e)?e:Pe(e)?new $g(e):ot(e)&&arguments.length>1?wf(e,t,s):f(e)}function wf(e,t,s){return new Fg(e,t,s)}class Bg{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new zo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Yi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&gt!==this)return nf(this,!0),!0}get value(){const t=this.dep.track();return rf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Hg(e,t,s=!1){let a,n;return Pe(e)?a=e:(a=e.get,n=e.set),new Bg(a,n,s)}const zg={GET:"get",HAS:"has",ITERATE:"iterate"},jg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ol={},lo=new WeakMap;let Ja;function Vg(){return Ja}function kf(e,t=!1,s=Ja){if(s){let a=lo.get(s);a||lo.set(s,a=[]),a.push(e)}}function qg(e,t,s=Ze){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:Ts(b)||n===!1||n===0?Ea(b,1):Ea(b);let d,u,p,h,m=!1,v=!1;if($t(e)?(u=()=>e.value,m=Ts(e)):La(e)?(u=()=>c(e),m=!0):Ie(e)?(v=!0,m=e.some(b=>La(b)||Ts(b)),u=()=>e.map(b=>{if($t(b))return b.value;if(La(b))return c(b);if(Pe(b))return r?r(b,2):b()})):Pe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Ma();try{p()}finally{Fa()}}const b=Ja;Ja=d;try{return r?r(e,3,[h]):e(h)}finally{Ja=b}}:u=Xt,t&&n){const b=u,_=n===!0?1/0:n;u=()=>Ea(b(),_)}const k=sf(),A=()=>{d.stop(),k&&k.active&&Ec(k.effects,d)};if(i&&t){const b=t;t=(..._)=>{const w=b(..._);return A(),w}}let y=v?new Array(e.length).fill(Ol):Ol;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const _=d.run();if(b||n||m||(v?_.some((w,C)=>qt(w,y[C])):qt(_,y))){p&&p();const w=Ja;Ja=d;try{const C=[_,y===Ol?void 0:v&&y[0]===Ol?[]:y,h];y=_,r?r(t,3,C):t(...C)}finally{Ja=w}}}else d.run()};return o&&o(g),d=new Zi(u),d.scheduler=l?()=>l(g,!1):g,h=b=>kf(b,!1,d),p=d.onStop=()=>{const b=lo.get(d);if(b){if(r)r(b,4);else for(const _ of b)_();lo.delete(d)}},t?a?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),A.pause=d.pause.bind(d),A.resume=d.resume.bind(d),A.stop=A,A}function Ea(e,t=1/0,s){if(t<=0||!ot(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,$t(e))Ea(e.value,t,s);else if(Ie(e))for(let a=0;a<e.length;a++)Ea(e[a],t,s);else if(En(e)||Qn(e))e.forEach(a=>{Ea(a,t,s)});else if(Mo(e)){for(const a in e)Ea(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ea(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Sf=[];function Gg(e){Sf.push(e)}function Kg(){Sf.pop()}function Wg(e,t){}const Jg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Zg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function xi(e,t,s,a){try{return a?e(...a):e()}catch(n){Rn(n,t,s)}}function Os(e,t,s,a){if(Pe(e)){const n=xi(e,t,s,a);return n&&Ac(n)&&n.catch(i=>{Rn(i,t,s)}),n}if(Ie(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Os(e[i],t,s,a));return n}}function Rn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ze;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Ma(),xi(i,null,10,[e,r,c]),Fa();return}}Yg(e,s,n,a,l)}function Yg(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const us=[];let oa=-1;const ti=[];let Za=null,Vn=0;const Tf=Promise.resolve();let oo=null;function Ot(e){const t=oo||Tf;return e?t.then(this?e.bind(this):e):t}function Qg(e){let t=oa+1,s=us.length;for(;t<s;){const a=t+s>>>1,n=us[a],i=el(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Mc(e){if(!(e.flags&1)){const t=el(e),s=us[us.length-1];!s||!(e.flags&2)&&t>=el(s)?us.push(e):us.splice(Qg(t),0,e),e.flags|=1,Cf()}}function Cf(){oo||(oo=Tf.then(Ef))}function Xi(e){Ie(e)?ti.push(...e):Za&&e.id===-1?Za.splice(Vn+1,0,e):e.flags&1||(ti.push(e),e.flags|=1),Cf()}function jd(e,t,s=oa+1){for(;s<us.length;s++){const a=us[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;us.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function ro(e){if(ti.length){const t=[...new Set(ti)].sort((s,a)=>el(s)-el(a));if(ti.length=0,Za){Za.push(...t);return}for(Za=t,Vn=0;Vn<Za.length;Vn++){const s=Za[Vn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Za=null,Vn=0}}const el=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Ef(e){try{for(oa=0;oa<us.length;oa++){const t=us[oa];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),xi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;oa<us.length;oa++){const t=us[oa];t&&(t.flags&=-2)}oa=-1,us.length=0,ro(),oo=null,(us.length||ti.length)&&Ef()}}let qn,Ll=[];function Af(e,t){var s,a;qn=e,qn?(qn.enabled=!0,Ll.forEach(({event:n,args:i})=>qn.emit(n,...i)),Ll=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Af(i,t)}),setTimeout(()=>{qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Ll=[])},3e3)):Ll=[]}let Qt=null,Go=null;function tl(e){const t=Qt;return Qt=e,Go=e&&e.type.__scopeId||null,t}function Xg(e){Go=e}function eb(){Go=null}const tb=e=>Fc;function Fc(e,t=Qt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&il(-1);const i=tl(t);let l;try{l=e(...n)}finally{tl(i),a._d&&il(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function sb(e,t){if(Qt===null)return e;const s=kl(Qt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ze]=t[n];i&&(Pe(i)&&(i={mounted:i,updated:i}),i.deep&&Ea(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function ra(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Ma(),Os(r,s,8,[e.el,o,e,t]),Fa())}}function zi(e,t){if(Yt){let s=Yt.provides;const a=Yt.parent&&Yt.parent.provides;a===s&&(s=Yt.provides=Object.create(a)),s[e]=t}}function Hs(e,t,s=!1){const a=fs();if(a||bn){let n=bn?bn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Pe(t)?t.call(a&&a.proxy):t}}function ab(){return!!(fs()||bn)}const Rf=Symbol.for("v-scx"),If=()=>Hs(Rf);function nb(e,t){return xl(e,null,t)}function ib(e,t){return xl(e,null,{flush:"post"})}function Of(e,t){return xl(e,null,{flush:"sync"})}function Ut(e,t,s){return xl(e,t,s)}function xl(e,t,s=Ze){const{immediate:a,deep:n,flush:i,once:l}=s,o=Je({},s),r=t&&a||!t&&i!=="post";let c;if(kn){if(i==="sync"){const h=If();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Xt,h.resume=Xt,h.pause=Xt,h}}const d=Yt;o.call=(h,m,v)=>Os(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Mt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():Mc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=qg(e,t,o);return kn&&(c?c.push(p):r&&p()),p}function lb(e,t,s){const a=this.proxy,n=He(e)?e.includes(".")?Lf(a,e):()=>a[e]:e.bind(a,a);let i;Pe(t)?i=t:(i=t.handler,s=t);const l=_i(this),o=xl(n,i.bind(a),s);return l(),o}function Lf(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Ka=new WeakMap,Nf=Symbol("_vte"),Df=e=>e.__isTeleport,fn=e=>e&&(e.disabled||e.disabled===""),ob=e=>e&&(e.defer||e.defer===""),Vd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,qd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Vr=(e,t)=>{const s=e&&e.to;return He(s)?t?t(s):null:s},rb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:k,parentNode:A}}=c,y=fn(t.props);let{dynamicChildren:g}=t;const b=(C,S,x)=>{C.shapeFlag&16&&d(C.children,S,x,n,i,l,o,r)},_=(C=t)=>{const S=fn(C.props),x=C.target=Vr(C.props,m),O=qr(x,C,v,h);x&&(l!=="svg"&&Vd(x)?l="svg":l!=="mathml"&&qd(x)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(x),S||(b(C,x,O),Pi(C,!1)))},w=C=>{const S=()=>{if(Ka.get(C)===S){if(Ka.delete(C),fn(C.props)){const x=A(C.el)||s;b(C,x,C.anchor),Pi(C,!0)}_(C)}};Ka.set(C,S),Mt(S,i)};if(e==null){const C=t.el=v(""),S=t.anchor=v("");if(h(C,s,a),h(S,s,a),ob(t.props)||i&&i.pendingBranch){w(t);return}y&&(b(t,s,S),Pi(t,!0)),_()}else{t.el=e.el;const C=t.anchor=e.anchor,S=Ka.get(e);if(S){S.flags|=8,Ka.delete(e),w(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,O=t.targetAnchor=e.targetAnchor,$=fn(e.props),E=$?s:x,M=$?C:O;if(l==="svg"||Vd(x)?l="svg":(l==="mathml"||qd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,E,n,i,l,o),Wc(e,t,!0)):r||u(e,t,E,M,n,i,l,o,!1),y)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Nl(t,s,C,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=Vr(t.props,m);V&&Nl(t,V,null,c,0)}else $&&Nl(t,x,O,c,1);Pi(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!fn(p),m=Ka.get(e);if(m&&(m.flags|=8,Ka.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let v=0;v<o.length;v++){const k=o[v];a(k,t,s,h,!!k.dynamicChildren)}},move:Nl,hydrate:cb};function Nl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Ka.has(e)&&(!u||fn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function cb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(k,A){let y=A;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(k,A){A.anchor=u(l(k),A,o(k),s,a,n,i)}const m=t.target=Vr(t.props,r),v=fn(t.props);if(m){const k=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,k),t.targetAnchor||qr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,k),t.targetAnchor||qr(m,t,d,c),u(k&&l(k),t,m,s,a,n,i))),Pi(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const db=rb;function Pi(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function qr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Nf]=l,e&&(a(i,e,n),a(l,e,n)),l}const Fs=Symbol("_leaveCb"),Ti=Symbol("_enterCb");function $c(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Zo(()=>{e.isUnmounting=!0}),e}const Ms=[Function,Array],Uc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ms,onEnter:Ms,onAfterEnter:Ms,onEnterCancelled:Ms,onBeforeLeave:Ms,onLeave:Ms,onAfterLeave:Ms,onLeaveCancelled:Ms,onBeforeAppear:Ms,onAppear:Ms,onAfterAppear:Ms,onAppearCancelled:Ms},Pf=e=>{const t=e.subTree;return t.component?Pf(t.component):t},ub={name:"BaseTransition",props:Uc,setup(e,{slots:t}){const s=fs(),a=$c();return()=>{const n=t.default&&Ko(t.default(),!0),i=n&&n.length?Mf(n):s.subTree?bh():void 0;if(!i)return;const l=tt(e),{mode:o}=l;if(a.isLeaving)return vr(i);const r=Gd(i);if(!r)return vr(i);let c=ri(r,l,a,s,u=>c=u);r.type!==Lt&&$a(r,c);let d=s.subTree&&Gd(s.subTree);if(d&&d.type!==Lt&&!Js(d,r)&&Pf(s).type!==Lt){let u=ri(d,l,a,s);if($a(d,u),o==="out-in"&&r.type!==Lt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},vr(i);o==="in-out"&&r.type!==Lt?u.delayLeave=(p,h,m)=>{const v=$f(a,d);v[String(d.key)]=d,p[Fs]=()=>{h(),p[Fs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Mf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Lt){t=s;break}}return t}const Ff=ub;function $f(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function ri(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:k,onAppear:A,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),_=$f(s,e),w=(x,O)=>{x&&Os(x,a,9,O)},C=(x,O)=>{const $=O[1];w(x,O),Ie(x)?x.every(E=>E.length<=1)&&$():x.length<=1&&$()},S={mode:l,persisted:o,beforeEnter(x){let O=r;if(!s.isMounted)if(i)O=k||r;else return;x[Fs]&&x[Fs](!0);const $=_[b];$&&Js(e,$)&&$.el[Fs]&&$.el[Fs](),w(O,[x])},enter(x){if(_[b]===e)return;let O=c,$=d,E=u;if(!s.isMounted)if(i)O=A||c,$=y||d,E=g||u;else return;let M=!1;x[Ti]=G=>{M||(M=!0,G?w(E,[x]):w($,[x]),S.delayedLeave&&S.delayedLeave(),x[Ti]=void 0)};const V=x[Ti].bind(null,!1);O?C(O,[x,V]):V()},leave(x,O){const $=String(e.key);if(x[Ti]&&x[Ti](!0),s.isUnmounting)return O();w(p,[x]);let E=!1;x[Fs]=V=>{E||(E=!0,O(),V?w(v,[x]):w(m,[x]),x[Fs]=void 0,_[$]===e&&delete _[$])};const M=x[Fs].bind(null,!1);_[$]=e,h?C(h,[x,M]):M()},clone(x){const O=ri(x,t,s,a,n);return n&&n(O),O}};return S}function vr(e){if(wl(e))return e=pa(e),e.children=null,e}function Gd(e){if(!wl(e))return Df(e.type)&&e.children?Mf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Pe(s.default))return s.default()}}function $a(e,t){e.shapeFlag&6&&e.component?(e.transition=t,$a(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Ko(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&n++,a=a.concat(Ko(l.children,t,o))):(t||l.type!==Lt)&&a.push(o!=null?pa(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function _l(e,t){return Pe(e)?Je({name:e.name},t,{setup:e}):e}function pb(){const e=fs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Bc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function fb(e){const t=fs(),s=Dc(null);if(t){const n=t.refs===Ze?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Kd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const co=new WeakMap;function si(e,t,s,a,n=!1){if(Ie(e)){e.forEach((v,k)=>si(v,t&&(Ie(t)?t[k]:t),s,a,n));return}if(Na(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&si(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?kl(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ze?o.refs={}:o.refs,u=o.setupState,p=tt(u),h=u===Ze?Wn:v=>Kd(d,v)?!1:rt(p,v),m=(v,k)=>!(k&&Kd(d,k));if(c!=null&&c!==r){if(Wd(t),He(c))d[c]=null,h(c)&&(u[c]=null);else if($t(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Pe(r))xi(r,o,12,[l,d]);else{const v=He(r),k=$t(r);if(v||k){const A=()=>{if(e.f){const y=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Ie(y)&&Ec(y,i);else if(Ie(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):k&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{A(),co.delete(e)};y.id=-1,co.set(e,y),Mt(y,s)}else Wd(e),A()}}}function Wd(e){const t=co.get(e);t&&(t.flags|=8,co.delete(e))}let Jd=!1;const Un=()=>{Jd||(console.error("Hydration completed but contains mismatches."),Jd=!0)},hb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",mb=e=>e.namespaceURI.includes("MathML"),Dl=e=>{if(e.nodeType===1){if(hb(e))return"svg";if(mb(e))return"mathml"}},Jn=e=>e.nodeType===8;function vb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),ro(),b._vnode=g;return}u(b.firstChild,g,null,null,null),ro(),b._vnode=g},u=(g,b,_,w,C,S=!1)=>{S=S||!!b.dynamicChildren;const x=Jn(g)&&g.data==="[",O=()=>v(g,b,_,w,C,x),{type:$,ref:E,shapeFlag:M,patchFlag:V}=b;let G=g.nodeType;b.el=g,V===-2&&(S=!1,b.dynamicChildren=null);let P=null;switch($){case en:G!==3?b.children===""?(r(b.el=n(""),l(g),g),P=g):P=O():(g.data!==b.children&&(Un(),g.data=b.children),P=i(g));break;case Lt:y(g)?(P=i(g),A(b.el=g.content.firstChild,g,_)):G!==8||x?P=O():P=i(g);break;case yn:if(x&&(g=i(g),G=g.nodeType),G===1||G===3){P=g;const L=!b.children.length;for(let N=0;N<b.staticCount;N++)L&&(b.children+=P.nodeType===1?P.outerHTML:P.data),N===b.staticCount-1&&(b.anchor=P),P=i(P);return x?i(P):P}else O();break;case Gt:x?P=m(g,b,_,w,C,S):P=O();break;default:if(M&1)(G!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?P=O():P=p(g,b,_,w,C,S);else if(M&6){b.slotScopeIds=C;const L=l(g);if(x?P=k(g):Jn(g)&&g.data==="teleport start"?P=k(g,g.data,"teleport end"):P=i(g),t(b,L,null,_,w,Dl(L),S),Na(b)&&!b.type.__asyncResolved){let N;x?(N=_t(Gt),N.anchor=P?P.previousSibling:L.lastChild):N=g.nodeType===3?Zc(""):_t("div"),N.el=g,b.component.subTree=N}}else M&64?G!==8?P=O():P=b.type.hydrate(g,b,_,w,C,S,e,h):M&128&&(P=b.type.hydrate(g,b,_,w,Dl(l(g)),C,S,e,u))}return E!=null&&si(E,null,w,b),P},p=(g,b,_,w,C,S)=>{S=S||!!b.dynamicChildren;const{type:x,props:O,patchFlag:$,shapeFlag:E,dirs:M,transition:V}=b,G=x==="input"||x==="option";if(G||$!==-1){M&&ra(b,null,_,"created");let P=!1;if(y(g)){P=ch(null,V)&&_&&_.vnode.props&&_.vnode.props.appear;const N=g.content.firstChild;if(P){const ne=N.getAttribute("class");ne&&(N.$cls=ne),V.beforeEnter(N)}A(N,g,_),b.el=g=N}if(E&16&&!(O&&(O.innerHTML||O.textContent))){let N=h(g.firstChild,b,g,_,w,C,S);for(N&&!Pl(g,1)&&Un();N;){const ne=N;N=N.nextSibling,o(ne)}}else if(E&8){let N=b.children;N[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(N=N.slice(1));const{textContent:ne}=g;ne!==N&&ne!==N.replace(/\r\n|\r/g,`
`)&&(Pl(g,0)||Un(),g.textContent=b.children)}if(O){if(G||!S||$&48){const N=g.tagName.includes("-");for(const ne in O)(G&&(ne.endsWith("value")||ne==="indeterminate")||Cn(ne)&&!Oa(ne)||ne[0]==="."||N&&!Oa(ne))&&a(g,ne,null,O[ne],void 0,_)}else if(O.onClick)a(g,"onClick",null,O.onClick,void 0,_);else if($&4&&La(O.style))for(const N in O.style)O.style[N]}let L;(L=O&&O.onVnodeBeforeMount)&&xs(L,_,b),M&&ra(b,null,_,"beforeMount"),((L=O&&O.onVnodeMounted)||M||P)&&fh(()=>{L&&xs(L,_,b),P&&V.enter(g),M&&ra(b,null,_,"mounted")},w)}return g.nextSibling},h=(g,b,_,w,C,S,x)=>{x=x||!!b.dynamicChildren;const O=b.children,$=O.length;let E=!1;for(let M=0;M<$;M++){const V=x?O[M]:O[M]=ws(O[M]),G=V.type===en;g?(G&&!x&&M+1<$&&ws(O[M+1]).type===en&&(r(n(g.data.slice(V.children.length)),_,i(g)),g.data=V.children),g=u(g,V,w,C,S,x)):G&&!V.children?r(V.el=n(""),_):(E||(E=!0,Pl(_,1)||Un()),s(null,V,_,null,w,C,Dl(_),S))}return g},m=(g,b,_,w,C,S)=>{const{slotScopeIds:x}=b;x&&(C=C?C.concat(x):x);const O=l(g),$=h(i(g),b,O,_,w,C,S);return $&&Jn($)&&$.data==="]"?i(b.anchor=$):(Un(),r(b.anchor=c("]"),O,$),$)},v=(g,b,_,w,C,S)=>{if(Pl(g.parentElement,1)||Un(),b.el=null,S){const $=k(g);for(;;){const E=i(g);if(E&&E!==$)o(E);else break}}const x=i(g),O=l(g);return o(g),s(null,b,O,x,_,w,Dl(O),C),_&&(_.vnode.el=b.el,Qo(_,b.el)),x},k=(g,b="[",_="]")=>{let w=0;for(;g;)if(g=i(g),g&&Jn(g)&&(g.data===b&&w++,g.data===_)){if(w===0)return i(g);w--}return g},A=(g,b,_)=>{const w=b.parentNode;w&&w.replaceChild(g,b);let C=_;for(;C;)C.vnode.el===b&&(C.vnode.el=C.subTree.el=g),C=C.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Zd="data-allow-mismatch",gb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Pl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Zd);)e=e.parentElement;const s=e&&e.getAttribute(Zd);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(gb[t])}}const bb=Bo().requestIdleCallback||(e=>setTimeout(e,1)),yb=Bo().cancelIdleCallback||(e=>clearTimeout(e)),xb=(e=1e4)=>t=>{const s=bb(t,{timeout:e});return()=>yb(s)};function _b(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const wb=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(_b(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},kb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Sb=(e=[])=>(t,s)=>{He(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function Tb(e,t){if(Jn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Jn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Na=e=>!!e.type.__asyncLoader;function Cb(e){Pe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((k,A)=>{r(v,()=>k(p()),()=>A(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return _l({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,k){let A=!1;(v.bu||(v.bu=[])).push(()=>A=!0);const y=()=>{A||k()},g=i?()=>{const b=i(y,_=>Tb(m,_));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Yt;if(Bc(m),d)return()=>Ml(d,m);const v=_=>{c=null,Rn(_,m,13,!a)};if(o&&m.suspense||kn)return h().then(_=>()=>Ml(_,m)).catch(_=>(v(_),()=>a?_t(a,{error:_}):null));const k=f(!1),A=f(),y=f(!!n);let g,b;return ft(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!k.value&&!A.value){const _=new Error(`Async component timed out after ${l}ms.`);v(_),A.value=_}},l)),h().then(()=>{m.isUnmounted||(k.value=!0,m.parent&&wl(m.parent.vnode)&&m.parent.update())}).catch(_=>{if(m.isUnmounted){c=null;return}v(_),A.value=_}),()=>{if(k.value&&d)return Ml(d,m);if(A.value&&a)return _t(a,{error:A.value});if(s&&!y.value)return Ml(s,m)}}})}function Ml(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=_t(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const wl=e=>e.type.__isKeepAlive,Eb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=fs(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,g,b,_,w)=>{const C=y.component;c(y,g,b,0,o),r(C.vnode,y,g,b,C,o,_,y.slotScopeIds,w),Mt(()=>{C.isDeactivated=!1,C.a&&ei(C.a);const S=y.props&&y.props.onVnodeMounted;S&&xs(S,C.parent,y)},o)},a.deactivate=y=>{const g=y.component;po(g.m),po(g.a),c(y,p,null,1,o),Mt(()=>{g.da&&ei(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&xs(b,g.parent,y),g.isDeactivated=!0},o)};function h(y){gr(y),d(y,s,o,!0)}function m(y){n.forEach((g,b)=>{const _=ec(Na(g)?g.type.__asyncResolved||{}:g.type);_&&!y(_)&&v(b)})}function v(y){const g=n.get(y);g&&(!l||!Js(g,l))?h(g):l&&gr(l),n.delete(y),i.delete(y)}Ut(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Mi(y,b)),g&&m(b=>!Mi(g,b))},{flush:"post",deep:!0});let k=null;const A=()=>{k!=null&&(fo(s.subTree.type)?Mt(()=>{n.set(k,Fl(s.subTree))},s.subTree.suspense):n.set(k,Fl(s.subTree)))};return Ge(A),Jo(A),Zo(()=>{n.forEach(y=>{const{subTree:g,suspense:b}=s,_=Fl(g);if(y.type===_.type&&y.key===_.key){gr(_);const w=_.component.da;w&&Mt(w,b);return}h(y)})}),()=>{if(k=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!Ua(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Fl(g);if(b.type===Lt)return l=null,b;const _=b.type,w=ec(Na(b)?b.type.__asyncResolved||{}:_),{include:C,exclude:S,max:x}=e;if(C&&(!w||!Mi(C,w))||S&&w&&Mi(S,w))return b.shapeFlag&=-257,l=b,g;const O=b.key==null?_:b.key,$=n.get(O);return b.el&&(b=pa(b),g.shapeFlag&128&&(g.ssContent=b)),k=O,$?(b.el=$.el,b.component=$.component,b.transition&&$a(b,b.transition),b.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,fo(g.type)?g:b}}},Ab=Eb;function Mi(e,t){return Ie(e)?e.some(s=>Mi(s,t)):He(e)?e.split(",").includes(t):$v(e)?(e.lastIndex=0,e.test(t)):!1}function es(e,t){Uf(e,"a",t)}function Wt(e,t){Uf(e,"da",t)}function Uf(e,t,s=Yt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Wo(t,a,s),s){let n=s.parent;for(;n&&n.parent;)wl(n.parent.vnode)&&Rb(a,t,s,n),n=n.parent}}function Rb(e,t,s,a){const n=Wo(t,e,a,!0);ft(()=>{Ec(a[t],n)},s)}function gr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Fl(e){return e.shapeFlag&128?e.ssContent:e}function Wo(e,t,s=Yt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Ma();const o=_i(s),r=Os(t,s,e,l);return o(),Fa(),r});return a?n.unshift(i):n.push(i),i}}const Ba=e=>(t,s=Yt)=>{(!kn||e==="sp")&&Wo(e,(...a)=>t(...a),s)},Bf=Ba("bm"),Ge=Ba("m"),Hc=Ba("bu"),Jo=Ba("u"),Zo=Ba("bum"),ft=Ba("um"),Hf=Ba("sp"),zf=Ba("rtg"),jf=Ba("rtc");function Vf(e,t=Yt){Wo("ec",e,t)}const zc="components",Ib="directives";function Ob(e,t){return jc(zc,e,!0,t)||e}const qf=Symbol.for("v-ndc");function Lb(e){return He(e)?jc(zc,e,!1)||e:e||qf}function Nb(e){return jc(Ib,e)}function jc(e,t,s=!0,a=!1){const n=Qt||Yt;if(n){const i=n.type;if(e===zc){const o=ec(i,!1);if(o&&(o===t||o===mt(t)||o===An(mt(t))))return i}const l=Yd(n[e]||i[e],t)||Yd(n.appContext[e],t);return!l&&a?i:l}}function Yd(e,t){return e&&(e[t]||e[mt(t)]||e[An(mt(t))])}function Db(e,t,s,a){let n;const i=s&&s[a],l=Ie(e);if(l||He(e)){const o=l&&La(e);let r=!1,c=!1;o&&(r=!Ts(e),c=ua(e),e=jo(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?oi(Qs(e[d])):Qs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(ot(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Pb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ie(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Mb(e,t,s={},a,n){if(Qt.ce||Qt.parent&&Na(Qt.parent)&&Qt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),nl(),ho(Gt,null,[_t("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),nl();const l=i&&Vc(i(s)),o=s.key||l&&l.key,r=ho(Gt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Vc(e){return e.some(t=>Ua(t)?!(t.type===Lt||t.type===Gt&&!Vc(t.children)):!0)?e:null}function Fb(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Xn(a)]=e[a];return s}const Gr=e=>e?_h(e)?kl(e):Gr(e.parent):null,ji=Je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Gr(e.parent),$root:e=>Gr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>qc(e),$forceUpdate:e=>e.f||(e.f=()=>{Mc(e.update)}),$nextTick:e=>e.n||(e.n=Ot.bind(e.proxy)),$watch:e=>lb.bind(e)}),br=(e,t)=>e!==Ze&&!e.__isScriptSetup&&rt(e,t),Kr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(br(a,t))return l[t]=1,a[t];if(n!==Ze&&rt(n,t))return l[t]=2,n[t];if(rt(i,t))return l[t]=3,i[t];if(s!==Ze&&rt(s,t))return l[t]=4,s[t];Wr&&(l[t]=0)}}const c=ji[t];let d,u;if(c)return t==="$attrs"&&ns(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ze&&rt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,rt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return br(n,t)?(n[t]=s,!0):a!==Ze&&rt(a,t)?(a[t]=s,!0):rt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ze&&o[0]!=="$"&&rt(e,o)||br(t,o)||rt(i,o)||rt(a,o)||rt(ji,o)||rt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:rt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},$b=Je({},Kr,{get(e,t){if(t!==Symbol.unscopables)return Kr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!qv(t)}});function Ub(){return null}function Bb(){return null}function Hb(e){}function zb(e){}function jb(){return null}function Vb(){}function qb(e,t){return null}function Gb(){return Gf().slots}function Kb(){return Gf().attrs}function Gf(e){const t=fs();return t.setupContext||(t.setupContext=Th(t))}function sl(e){return Ie(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Wb(e,t){const s=sl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ie(n)||Pe(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function Jb(e,t){return!e||!t?e||t:Ie(e)&&Ie(t)?e.concat(t):Je({},sl(e),sl(t))}function Zb(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Yb(e){const t=fs(),s=kn;let a=e();ll(),s&&ni(!1);const n=()=>{_i(t),s&&ni(!0)},i=()=>{fs()!==t&&t.scope.off(),ll(),s&&ni(!1)};return Ac(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Wr=!0;function Qb(e){const t=qc(e),s=e.proxy,a=e.ctx;Wr=!1,t.beforeCreate&&Qd(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:k,beforeDestroy:A,beforeUnmount:y,destroyed:g,unmounted:b,render:_,renderTracked:w,renderTriggered:C,errorCaptured:S,serverPrefetch:x,expose:O,inheritAttrs:$,components:E,directives:M,filters:V}=t;if(c&&Xb(c,a,null),l)for(const L in l){const N=l[L];Pe(N)&&(a[L]=N.bind(s))}if(n){const L=n.call(s,s);ot(L)&&(e.data=an(L))}if(Wr=!0,i)for(const L in i){const N=i[L],ne=Pe(N)?N.bind(s,s):Pe(N.get)?N.get.bind(s,s):Xt,le=!Pe(N)&&Pe(N.set)?N.set.bind(s):Xt,U=z({get:ne,set:le});Object.defineProperty(a,L,{enumerable:!0,configurable:!0,get:()=>U.value,set:K=>U.value=K})}if(o)for(const L in o)Kf(o[L],a,s,L);if(r){const L=Pe(r)?r.call(s):r;Reflect.ownKeys(L).forEach(N=>{zi(N,L[N])})}d&&Qd(d,e,"c");function P(L,N){Ie(N)?N.forEach(ne=>L(ne.bind(s))):N&&L(N.bind(s))}if(P(Bf,u),P(Ge,p),P(Hc,h),P(Jo,m),P(es,v),P(Wt,k),P(Vf,S),P(jf,w),P(zf,C),P(Zo,y),P(ft,b),P(Hf,x),Ie(O))if(O.length){const L=e.exposed||(e.exposed={});O.forEach(N=>{Object.defineProperty(L,N,{get:()=>s[N],set:ne=>s[N]=ne,enumerable:!0})})}else e.exposed||(e.exposed={});_&&e.render===Xt&&(e.render=_),$!=null&&(e.inheritAttrs=$),E&&(e.components=E),M&&(e.directives=M),x&&Bc(e)}function Xb(e,t,s=Xt){Ie(e)&&(e=Jr(e));for(const a in e){const n=e[a];let i;ot(n)?"default"in n?i=Hs(n.from||a,n.default,!0):i=Hs(n.from||a):i=Hs(n),$t(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function Qd(e,t,s){Os(Ie(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function Kf(e,t,s,a){let n=a.includes(".")?Lf(s,a):()=>s[a];if(He(e)){const i=t[e];Pe(i)&&Ut(n,i)}else if(Pe(e))Ut(n,e.bind(s));else if(ot(e))if(Ie(e))e.forEach(i=>Kf(i,t,s,a));else{const i=Pe(e.handler)?e.handler.bind(s):t[e.handler];Pe(i)&&Ut(n,i,e)}}function qc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>uo(r,c,l,!0)),uo(r,t,l)),ot(t)&&i.set(t,r),r}function uo(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&uo(e,i,s,!0),n&&n.forEach(l=>uo(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=ey[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const ey={data:Xd,props:eu,emits:eu,methods:Fi,computed:Fi,beforeCreate:rs,created:rs,beforeMount:rs,mounted:rs,beforeUpdate:rs,updated:rs,beforeDestroy:rs,beforeUnmount:rs,destroyed:rs,unmounted:rs,activated:rs,deactivated:rs,errorCaptured:rs,serverPrefetch:rs,components:Fi,directives:Fi,watch:sy,provide:Xd,inject:ty};function Xd(e,t){return t?e?function(){return Je(Pe(e)?e.call(this,this):e,Pe(t)?t.call(this,this):t)}:t:e}function ty(e,t){return Fi(Jr(e),Jr(t))}function Jr(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function rs(e,t){return e?[...new Set([].concat(e,t))]:t}function Fi(e,t){return e?Je(Object.create(null),e,t):t}function eu(e,t){return e?Ie(e)&&Ie(t)?[...new Set([...e,...t])]:Je(Object.create(null),sl(e),sl(t??{})):t}function sy(e,t){if(!e)return t;if(!t)return e;const s=Je(Object.create(null),e);for(const a in t)s[a]=rs(e[a],t[a]);return s}function Wf(){return{app:null,config:{isNativeTag:Wn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let ay=0;function ny(e,t){return function(a,n=null){Pe(a)||(a=Je({},a)),n!=null&&!ot(n)&&(n=null);const i=Wf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:ay++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Eh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Pe(d.install)?(l.add(d),d.install(c,...u)):Pe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||_t(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,kl(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Os(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=bn;bn=c;try{return d()}finally{bn=u}}};return c}}let bn=null;function iy(e,t,s=Ze){const a=fs(),n=mt(t),i=ks(t),l=Jf(e,n),o=_f((r,c)=>{let d,u=Ze,p;return Of(()=>{const h=e[n];qt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!qt(m,d)&&!(u!==Ze&&qt(h,u)))return;const v=a.vnode.props,k=!!(v&&(t in v||n in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${n}`in v||`onUpdate:${i}`in v));k||(d=h,c()),a.emit(`update:${t}`,m),qt(h,u)&&(qt(h,m)&&!qt(m,p)||k&&u!==Ze&&!qt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ze:o,done:!1}:{done:!0}}}},o}const Jf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${mt(t)}Modifiers`]||e[`${ks(t)}Modifiers`];function ly(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ze;let n=s;const i=t.startsWith("update:"),l=i&&Jf(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>He(d)?d.trim():d)),l.number&&(n=s.map(Uo)));let o,r=a[o=Xn(t)]||a[o=Xn(mt(t))];!r&&i&&(r=a[o=Xn(ks(t))]),r&&Os(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Os(c,e,6,n)}}const oy=new WeakMap;function Zf(e,t,s=!1){const a=s?oy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Pe(e)){const r=c=>{const d=Zf(c,t,!0);d&&(o=!0,Je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(ot(e)&&a.set(e,null),null):(Ie(i)?i.forEach(r=>l[r]=null):Je(l,i),ot(e)&&a.set(e,l),l)}function Yo(e,t){return!e||!Cn(t)?!1:(t=t.slice(2).replace(/Once$/,""),rt(e,t[0].toLowerCase()+t.slice(1))||rt(e,ks(t))||rt(e,t))}function Jl(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,k=tl(e);let A,y;try{if(s.shapeFlag&4){const b=n||a,_=b;A=ws(c.call(_,b,d,u,h,p,m)),y=o}else{const b=t;A=ws(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:cy(o)}}catch(b){Vi.length=0,Rn(b,e,1),A=_t(Lt)}let g=A;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:_}=g;b.length&&_&7&&(i&&b.some(Po)&&(y=dy(y,i)),g=pa(g,y,!1,!0))}return s.dirs&&(g=pa(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&$a(g,s.transition),A=g,tl(k),A}function ry(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(Ua(n)){if(n.type!==Lt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const cy=e=>{let t;for(const s in e)(s==="class"||s==="style"||Cn(s))&&((t||(t={}))[s]=e[s]);return t},dy=(e,t)=>{const s={};for(const a in e)(!Po(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function uy(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?tu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Yf(l,a,p)&&!Yo(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?tu(a,l,c):!0:!!l;return!1}function tu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(Yf(t,e,i)&&!Yo(s,i))return!0}return!1}function Yf(e,t,s){const a=e[s],n=t[s];return s==="style"&&ot(a)&&ot(n)?!Pa(a,n):a!==n}function Qo({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const Qf={},Xf=()=>Object.create(Qf),eh=e=>Object.getPrototypeOf(e)===Qf;function py(e,t,s,a=!1){const n={},i=Xf();e.propsDefaults=Object.create(null),th(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Nc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function fy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=tt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Yo(e.emitsOptions,p))continue;const h=t[p];if(r)if(rt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=mt(p);n[m]=Zr(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{th(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!rt(t,u)&&((d=ks(u))===u||!rt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=Zr(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!rt(t,u))&&(delete i[u],c=!0)}c&&Ca(e.attrs,"set","")}function th(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Oa(r))continue;const c=t[r];let d;n&&rt(n,d=mt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Yo(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=tt(s),c=o||Ze;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Zr(n,r,u,c[u],e,!rt(c,u))}}return l}function Zr(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=rt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Pe(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=_i(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===ks(s))&&(a=!0))}return a}const hy=new WeakMap;function sh(e,t,s=!1){const a=s?hy:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Pe(e)){const d=u=>{r=!0;const[p,h]=sh(u,t,!0);Je(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return ot(e)&&a.set(e,Yn),Yn;if(Ie(i))for(let d=0;d<i.length;d++){const u=mt(i[d]);su(u)&&(l[u]=Ze)}else if(i)for(const d in i){const u=mt(d);if(su(u)){const p=i[d],h=l[u]=Ie(p)||Pe(p)?{type:p}:Je({},p),m=h.type;let v=!1,k=!0;if(Ie(m))for(let A=0;A<m.length;++A){const y=m[A],g=Pe(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(k=!1)}else v=Pe(m)&&m.name==="Boolean";h[0]=v,h[1]=k,(v||rt(h,"default"))&&o.push(u)}}const c=[l,o];return ot(e)&&a.set(e,c),c}function su(e){return e[0]!=="$"&&!Oa(e)}const Gc=e=>e==="_"||e==="_ctx"||e==="$stable",Kc=e=>Ie(e)?e.map(ws):[ws(e)],my=(e,t,s)=>{if(t._n)return t;const a=Fc((...n)=>Kc(t(...n)),s);return a._c=!1,a},ah=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Gc(n))continue;const i=e[n];if(Pe(i))t[n]=my(n,i,a);else if(i!=null){const l=Kc(i);t[n]=()=>l}}},nh=(e,t)=>{const s=Kc(t);e.slots.default=()=>s},ih=(e,t,s)=>{for(const a in t)(s||!Gc(a))&&(e[a]=t[a])},vy=(e,t,s)=>{const a=e.slots=Xf();if(e.vnode.shapeFlag&32){const n=t._;n?(ih(a,t,s),s&&Zp(a,"_",n,!0)):ah(t,a)}else t&&nh(e,t)},gy=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ze;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:ih(n,t,s):(i=!t.$stable,ah(t,n)),l=t}else t&&(nh(e,t),l={default:1});if(i)for(const o in n)!Gc(o)&&l[o]==null&&delete n[o]},Mt=fh;function lh(e){return rh(e)}function oh(e){return rh(e,vb)}function rh(e,t){const s=Bo();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Xt,insertStaticContent:m}=e,v=(T,F,I,Z=null,Y=null,ae=null,ve=void 0,H=null,ee=!!F.dynamicChildren)=>{if(T===F)return;T&&!Js(T,F)&&(Z=q(T),K(T,Y,ae,!0),T=null),F.patchFlag===-2&&(ee=!1,F.dynamicChildren=null);const{type:X,ref:he,shapeFlag:fe}=F;switch(X){case en:k(T,F,I,Z);break;case Lt:A(T,F,I,Z);break;case yn:T==null&&y(F,I,Z,ve);break;case Gt:E(T,F,I,Z,Y,ae,ve,H,ee);break;default:fe&1?_(T,F,I,Z,Y,ae,ve,H,ee):fe&6?M(T,F,I,Z,Y,ae,ve,H,ee):(fe&64||fe&128)&&X.process(T,F,I,Z,Y,ae,ve,H,ee,me)}he!=null&&Y?si(he,T&&T.ref,ae,F||T,!F):he==null&&T&&T.ref!=null&&si(T.ref,null,ae,T,!0)},k=(T,F,I,Z)=>{if(T==null)a(F.el=o(F.children),I,Z);else{const Y=F.el=T.el;F.children!==T.children&&c(Y,F.children)}},A=(T,F,I,Z)=>{T==null?a(F.el=r(F.children||""),I,Z):F.el=T.el},y=(T,F,I,Z)=>{[T.el,T.anchor]=m(T.children,F,I,Z,T.el,T.anchor)},g=({el:T,anchor:F},I,Z)=>{let Y;for(;T&&T!==F;)Y=p(T),a(T,I,Z),T=Y;a(F,I,Z)},b=({el:T,anchor:F})=>{let I;for(;T&&T!==F;)I=p(T),n(T),T=I;n(F)},_=(T,F,I,Z,Y,ae,ve,H,ee)=>{if(F.type==="svg"?ve="svg":F.type==="math"&&(ve="mathml"),T==null)w(F,I,Z,Y,ae,ve,H,ee);else{const X=T.el&&T.el._isVueCE?T.el:null;try{X&&X._beginPatch(),x(T,F,Y,ae,ve,H,ee)}finally{X&&X._endPatch()}}},w=(T,F,I,Z,Y,ae,ve,H)=>{let ee,X;const{props:he,shapeFlag:fe,transition:ye,dirs:Oe}=T;if(ee=T.el=l(T.type,ae,he&&he.is,he),fe&8?d(ee,T.children):fe&16&&S(T.children,ee,null,Z,Y,yr(T,ae),ve,H),Oe&&ra(T,null,Z,"created"),C(ee,T,T.scopeId,ve,Z),he){for(const Fe in he)Fe!=="value"&&!Oa(Fe)&&i(ee,Fe,null,he[Fe],ae,Z);"value"in he&&i(ee,"value",null,he.value,ae),(X=he.onVnodeBeforeMount)&&xs(X,Z,T)}Oe&&ra(T,null,Z,"beforeMount");const ge=ch(Y,ye);ge&&ye.beforeEnter(ee),a(ee,F,I),((X=he&&he.onVnodeMounted)||ge||Oe)&&Mt(()=>{try{X&&xs(X,Z,T),ge&&ye.enter(ee),Oe&&ra(T,null,Z,"mounted")}finally{}},Y)},C=(T,F,I,Z,Y)=>{if(I&&h(T,I),Z)for(let ae=0;ae<Z.length;ae++)h(T,Z[ae]);if(Y){let ae=Y.subTree;if(F===ae||fo(ae.type)&&(ae.ssContent===F||ae.ssFallback===F)){const ve=Y.vnode;C(T,ve,ve.scopeId,ve.slotScopeIds,Y.parent)}}},S=(T,F,I,Z,Y,ae,ve,H,ee=0)=>{for(let X=ee;X<T.length;X++){const he=T[X]=H?Sa(T[X]):ws(T[X]);v(null,he,F,I,Z,Y,ae,ve,H)}},x=(T,F,I,Z,Y,ae,ve)=>{const H=F.el=T.el;let{patchFlag:ee,dynamicChildren:X,dirs:he}=F;ee|=T.patchFlag&16;const fe=T.props||Ze,ye=F.props||Ze;let Oe;if(I&&rn(I,!1),(Oe=ye.onVnodeBeforeUpdate)&&xs(Oe,I,F,T),he&&ra(F,T,I,"beforeUpdate"),I&&rn(I,!0),(fe.innerHTML&&ye.innerHTML==null||fe.textContent&&ye.textContent==null)&&d(H,""),X?O(T.dynamicChildren,X,H,I,Z,yr(F,Y),ae):ve||N(T,F,H,null,I,Z,yr(F,Y),ae,!1),ee>0){if(ee&16)$(H,fe,ye,I,Y);else if(ee&2&&fe.class!==ye.class&&i(H,"class",null,ye.class,Y),ee&4&&i(H,"style",fe.style,ye.style,Y),ee&8){const ge=F.dynamicProps;for(let Fe=0;Fe<ge.length;Fe++){const $e=ge[Fe],ze=fe[$e],Ye=ye[$e];(Ye!==ze||$e==="value")&&i(H,$e,ze,Ye,Y,I)}}ee&1&&T.children!==F.children&&d(H,F.children)}else!ve&&X==null&&$(H,fe,ye,I,Y);((Oe=ye.onVnodeUpdated)||he)&&Mt(()=>{Oe&&xs(Oe,I,F,T),he&&ra(F,T,I,"updated")},Z)},O=(T,F,I,Z,Y,ae,ve)=>{for(let H=0;H<F.length;H++){const ee=T[H],X=F[H],he=ee.el&&(ee.type===Gt||!Js(ee,X)||ee.shapeFlag&198)?u(ee.el):I;v(ee,X,he,null,Z,Y,ae,ve,!0)}},$=(T,F,I,Z,Y)=>{if(F!==I){if(F!==Ze)for(const ae in F)!Oa(ae)&&!(ae in I)&&i(T,ae,F[ae],null,Y,Z);for(const ae in I){if(Oa(ae))continue;const ve=I[ae],H=F[ae];ve!==H&&ae!=="value"&&i(T,ae,H,ve,Y,Z)}"value"in I&&i(T,"value",F.value,I.value,Y)}},E=(T,F,I,Z,Y,ae,ve,H,ee)=>{const X=F.el=T?T.el:o(""),he=F.anchor=T?T.anchor:o("");let{patchFlag:fe,dynamicChildren:ye,slotScopeIds:Oe}=F;Oe&&(H=H?H.concat(Oe):Oe),T==null?(a(X,I,Z),a(he,I,Z),S(F.children||[],I,he,Y,ae,ve,H,ee)):fe>0&&fe&64&&ye&&T.dynamicChildren&&T.dynamicChildren.length===ye.length?(O(T.dynamicChildren,ye,I,Y,ae,ve,H),(F.key!=null||Y&&F===Y.subTree)&&Wc(T,F,!0)):N(T,F,I,he,Y,ae,ve,H,ee)},M=(T,F,I,Z,Y,ae,ve,H,ee)=>{F.slotScopeIds=H,T==null?F.shapeFlag&512?Y.ctx.activate(F,I,Z,ve,ee):V(F,I,Z,Y,ae,ve,ee):G(T,F,ee)},V=(T,F,I,Z,Y,ae,ve)=>{const H=T.component=xh(T,Z,Y);if(wl(T)&&(H.ctx.renderer=me),wh(H,!1,ve),H.asyncDep){if(Y&&Y.registerDep(H,P,ve),!T.el){const ee=H.subTree=_t(Lt);A(null,ee,F,I),T.placeholder=ee.el}}else P(H,T,F,I,Y,ae,ve)},G=(T,F,I)=>{const Z=F.component=T.component;if(uy(T,F,I))if(Z.asyncDep&&!Z.asyncResolved){L(Z,F,I);return}else Z.next=F,Z.update();else F.el=T.el,Z.vnode=F},P=(T,F,I,Z,Y,ae,ve)=>{const H=()=>{if(T.isMounted){let{next:fe,bu:ye,u:Oe,parent:ge,vnode:Fe}=T;{const nt=dh(T);if(nt){fe&&(fe.el=Fe.el,L(T,fe,ve)),nt.asyncDep.then(()=>{Mt(()=>{T.isUnmounted||X()},Y)});return}}let $e=fe,ze;rn(T,!1),fe?(fe.el=Fe.el,L(T,fe,ve)):fe=Fe,ye&&ei(ye),(ze=fe.props&&fe.props.onVnodeBeforeUpdate)&&xs(ze,ge,fe,Fe),rn(T,!0);const Ye=Jl(T),at=T.subTree;T.subTree=Ye,v(at,Ye,u(at.el),q(at),T,Y,ae),fe.el=Ye.el,$e===null&&Qo(T,Ye.el),Oe&&Mt(Oe,Y),(ze=fe.props&&fe.props.onVnodeUpdated)&&Mt(()=>xs(ze,ge,fe,Fe),Y)}else{let fe;const{el:ye,props:Oe}=F,{bm:ge,m:Fe,parent:$e,root:ze,type:Ye}=T,at=Na(F);if(rn(T,!1),ge&&ei(ge),!at&&(fe=Oe&&Oe.onVnodeBeforeMount)&&xs(fe,$e,F),rn(T,!0),ye&&Me){const nt=()=>{T.subTree=Jl(T),Me(ye,T.subTree,T,Y,null)};at&&Ye.__asyncHydrate?Ye.__asyncHydrate(ye,T,nt):nt()}else{ze.ce&&ze.ce._hasShadowRoot()&&ze.ce._injectChildStyle(Ye,T.parent?T.parent.type:void 0);const nt=T.subTree=Jl(T);v(null,nt,I,Z,T,Y,ae),F.el=nt.el}if(Fe&&Mt(Fe,Y),!at&&(fe=Oe&&Oe.onVnodeMounted)){const nt=F;Mt(()=>xs(fe,$e,nt),Y)}(F.shapeFlag&256||$e&&Na($e.vnode)&&$e.vnode.shapeFlag&256)&&T.a&&Mt(T.a,Y),T.isMounted=!0,F=I=Z=null}};T.scope.on();const ee=T.effect=new Zi(H);T.scope.off();const X=T.update=ee.run.bind(ee),he=T.job=ee.runIfDirty.bind(ee);he.i=T,he.id=T.uid,ee.scheduler=()=>Mc(he),rn(T,!0),X()},L=(T,F,I)=>{F.component=T;const Z=T.vnode.props;T.vnode=F,T.next=null,fy(T,F.props,Z,I),gy(T,F.children,I),Ma(),jd(T),Fa()},N=(T,F,I,Z,Y,ae,ve,H,ee=!1)=>{const X=T&&T.children,he=T?T.shapeFlag:0,fe=F.children,{patchFlag:ye,shapeFlag:Oe}=F;if(ye>0){if(ye&128){le(X,fe,I,Z,Y,ae,ve,H,ee);return}else if(ye&256){ne(X,fe,I,Z,Y,ae,ve,H,ee);return}}Oe&8?(he&16&&de(X,Y,ae),fe!==X&&d(I,fe)):he&16?Oe&16?le(X,fe,I,Z,Y,ae,ve,H,ee):de(X,Y,ae,!0):(he&8&&d(I,""),Oe&16&&S(fe,I,Z,Y,ae,ve,H,ee))},ne=(T,F,I,Z,Y,ae,ve,H,ee)=>{T=T||Yn,F=F||Yn;const X=T.length,he=F.length,fe=Math.min(X,he);let ye;for(ye=0;ye<fe;ye++){const Oe=F[ye]=ee?Sa(F[ye]):ws(F[ye]);v(T[ye],Oe,I,null,Y,ae,ve,H,ee)}X>he?de(T,Y,ae,!0,!1,fe):S(F,I,Z,Y,ae,ve,H,ee,fe)},le=(T,F,I,Z,Y,ae,ve,H,ee)=>{let X=0;const he=F.length;let fe=T.length-1,ye=he-1;for(;X<=fe&&X<=ye;){const Oe=T[X],ge=F[X]=ee?Sa(F[X]):ws(F[X]);if(Js(Oe,ge))v(Oe,ge,I,null,Y,ae,ve,H,ee);else break;X++}for(;X<=fe&&X<=ye;){const Oe=T[fe],ge=F[ye]=ee?Sa(F[ye]):ws(F[ye]);if(Js(Oe,ge))v(Oe,ge,I,null,Y,ae,ve,H,ee);else break;fe--,ye--}if(X>fe){if(X<=ye){const Oe=ye+1,ge=Oe<he?F[Oe].el:Z;for(;X<=ye;)v(null,F[X]=ee?Sa(F[X]):ws(F[X]),I,ge,Y,ae,ve,H,ee),X++}}else if(X>ye)for(;X<=fe;)K(T[X],Y,ae,!0),X++;else{const Oe=X,ge=X,Fe=new Map;for(X=ge;X<=ye;X++){const Ee=F[X]=ee?Sa(F[X]):ws(F[X]);Ee.key!=null&&Fe.set(Ee.key,X)}let $e,ze=0;const Ye=ye-ge+1;let at=!1,nt=0;const Q=new Array(Ye);for(X=0;X<Ye;X++)Q[X]=0;for(X=Oe;X<=fe;X++){const Ee=T[X];if(ze>=Ye){K(Ee,Y,ae,!0);continue}let Le;if(Ee.key!=null)Le=Fe.get(Ee.key);else for($e=ge;$e<=ye;$e++)if(Q[$e-ge]===0&&Js(Ee,F[$e])){Le=$e;break}Le===void 0?K(Ee,Y,ae,!0):(Q[Le-ge]=X+1,Le>=nt?nt=Le:at=!0,v(Ee,F[Le],I,null,Y,ae,ve,H,ee),ze++)}const xe=at?by(Q):Yn;for($e=xe.length-1,X=Ye-1;X>=0;X--){const Ee=ge+X,Le=F[Ee],te=F[Ee+1],Ce=Ee+1<he?te.el||uh(te):Z;Q[X]===0?v(null,Le,I,Ce,Y,ae,ve,H,ee):at&&($e<0||X!==xe[$e]?U(Le,I,Ce,2):$e--)}}},U=(T,F,I,Z,Y=null)=>{const{el:ae,type:ve,transition:H,children:ee,shapeFlag:X}=T;if(X&6){U(T.component.subTree,F,I,Z);return}if(X&128){T.suspense.move(F,I,Z);return}if(X&64){ve.move(T,F,I,me);return}if(ve===Gt){a(ae,F,I);for(let fe=0;fe<ee.length;fe++)U(ee[fe],F,I,Z);a(T.anchor,F,I);return}if(ve===yn){g(T,F,I);return}if(Z!==2&&X&1&&H)if(Z===0)H.persisted&&!ae[Fs]?a(ae,F,I):(H.beforeEnter(ae),a(ae,F,I),Mt(()=>H.enter(ae),Y));else{const{leave:fe,delayLeave:ye,afterLeave:Oe}=H,ge=()=>{T.ctx.isUnmounted?n(ae):a(ae,F,I)},Fe=()=>{const $e=ae._isLeaving||!!ae[Fs];ae._isLeaving&&ae[Fs](!0),H.persisted&&!$e?ge():fe(ae,()=>{ge(),Oe&&Oe()})};ye?ye(ae,ge,Fe):Fe()}else a(ae,F,I)},K=(T,F,I,Z=!1,Y=!1)=>{const{type:ae,props:ve,ref:H,children:ee,dynamicChildren:X,shapeFlag:he,patchFlag:fe,dirs:ye,cacheIndex:Oe,memo:ge}=T;if(fe===-2&&(Y=!1),H!=null&&(Ma(),si(H,null,I,T,!0),Fa()),Oe!=null&&(F.renderCache[Oe]=void 0),he&256){F.ctx.deactivate(T);return}const Fe=he&1&&ye,$e=!Na(T);let ze;if($e&&(ze=ve&&ve.onVnodeBeforeUnmount)&&xs(ze,F,T),he&6)ue(T.component,I,Z);else{if(he&128){T.suspense.unmount(I,Z);return}Fe&&ra(T,null,F,"beforeUnmount"),he&64?T.type.remove(T,F,I,me,Z):X&&!X.hasOnce&&(ae!==Gt||fe>0&&fe&64)?de(X,F,I,!1,!0):(ae===Gt&&fe&384||!Y&&he&16)&&de(ee,F,I),Z&&oe(T)}const Ye=ge!=null&&Oe==null;($e&&(ze=ve&&ve.onVnodeUnmounted)||Fe||Ye)&&Mt(()=>{ze&&xs(ze,F,T),Fe&&ra(T,null,F,"unmounted"),Ye&&(T.el=null)},I)},oe=T=>{const{type:F,el:I,anchor:Z,transition:Y}=T;if(F===Gt){W(I,Z);return}if(F===yn){b(T);return}const ae=()=>{n(I),Y&&!Y.persisted&&Y.afterLeave&&Y.afterLeave()};if(T.shapeFlag&1&&Y&&!Y.persisted){const{leave:ve,delayLeave:H}=Y,ee=()=>ve(I,ae);H?H(T.el,ae,ee):ee()}else ae()},W=(T,F)=>{let I;for(;T!==F;)I=p(T),n(T),T=I;n(F)},ue=(T,F,I)=>{const{bum:Z,scope:Y,job:ae,subTree:ve,um:H,m:ee,a:X}=T;po(ee),po(X),Z&&ei(Z),Y.stop(),ae&&(ae.flags|=8,K(ve,T,F,I)),H&&Mt(H,F),Mt(()=>{T.isUnmounted=!0},F)},de=(T,F,I,Z=!1,Y=!1,ae=0)=>{for(let ve=ae;ve<T.length;ve++)K(T[ve],F,I,Z,Y)},q=T=>{if(T.shapeFlag&6)return q(T.component.subTree);if(T.shapeFlag&128)return T.suspense.next();const F=p(T.anchor||T.el),I=F&&F[Nf];return I?p(I):F};let ce=!1;const pe=(T,F,I)=>{let Z;T==null?F._vnode&&(K(F._vnode,null,null,!0),Z=F._vnode.component):v(F._vnode||null,T,F,null,null,null,I),F._vnode=T,ce||(ce=!0,jd(Z),ro(),ce=!1)},me={p:v,um:K,m:U,r:oe,mt:V,mc:S,pc:N,pbc:O,n:q,o:e};let _e,Me;return t&&([_e,Me]=t(me)),{render:pe,hydrate:_e,createApp:ny(pe,_e)}}function yr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function ch(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Wc(e,t,s=!1){const a=e.children,n=t.children;if(Ie(a)&&Ie(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=Sa(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Wc(l,o)),o.type===en&&(o.patchFlag===-1&&(o=n[i]=Sa(o)),o.el=l.el),o.type===Lt&&!o.el&&(o.el=l.el)}}function by(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function dh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:dh(t)}function po(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function uh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?uh(t.subTree):null}const fo=e=>e.__isSuspense;let Yr=0;const yy={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)_y(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}wy(e,t,s,a,n,l,o,r,c)}},hydrate:ky,normalize:Sy},xy=yy;function al(e,t){const s=e.props&&e.props[t];Pe(s)&&s()}function _y(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=ph(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(al(e,"onPending"),al(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ai(p,e.ssFallback)):p.resolve(!1,!0)}function wy(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:k,isHydrating:A}=u;if(v)u.pendingBranch=p,Js(v,p)?(r(v,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():k&&(A||(r(m,h,s,a,n,null,i,l,o),ai(u,h)))):(u.pendingId=Yr++,A?(u.isHydrating=!1,u.activeBranch=v):c(v,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),k?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ai(u,h))):m&&Js(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Js(m,p))r(m,p,s,a,n,u,i,l,o),ai(u,p);else if(al(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Yr++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function ph(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:k}}=c;let A;const y=Ty(e);y&&t&&t.pendingBranch&&(A=t.pendingId,t.deps++);const g=e.props?ao(e.props.timeout):void 0,b=i,_={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:Yr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(w=!1,C=!1){const{vnode:S,activeBranch:x,pendingBranch:O,pendingId:$,effects:E,parentComponent:M,container:V,isInFallback:G}=_;let P=!1;if(_.isHydrating)_.isHydrating=!1;else if(!w){P=x&&O.transition&&O.transition.mode==="out-in";let ne=!1;P&&(x.transition.afterLeave=()=>{$===_.pendingId&&(p(O,V,i===b&&!ne?m(x):i,0),Xi(E),G&&S.ssFallback&&(S.ssFallback.el=null))}),x&&!_.isFallbackMountPending&&(v(x.el)===V&&(i=m(x),ne=!0),h(x,M,_,!0),!P&&G&&S.ssFallback&&Mt(()=>S.ssFallback.el=null,_)),P||p(O,V,i,0)}_.isFallbackMountPending=!1,ai(_,O),_.pendingBranch=null,_.isInFallback=!1;let L=_.parent,N=!1;for(;L;){if(L.pendingBranch){L.effects.push(...E),N=!0;break}L=L.parent}!N&&!P&&Xi(E),_.effects=[],y&&t&&t.pendingBranch&&A===t.pendingId&&(t.deps--,t.deps===0&&!C&&t.resolve()),al(S,"onResolve")},fallback(w){if(!_.pendingBranch)return;const{vnode:C,activeBranch:S,parentComponent:x,container:O,namespace:$}=_;al(C,"onFallback");const E=m(S),M=()=>{_.isFallbackMountPending=!1,_.isInFallback&&(u(null,w,O,E,x,null,$,o,r),ai(_,w))},V=w.transition&&w.transition.mode==="out-in";V&&(_.isFallbackMountPending=!0,S.transition.afterLeave=M),_.isInFallback=!0,h(S,x,null,!0),V||M()},move(w,C,S){_.activeBranch&&p(_.activeBranch,w,C,S),_.container=w},next(){return _.activeBranch&&m(_.activeBranch)},registerDep(w,C,S){const x=!!_.pendingBranch;x&&_.deps++;const O=w.vnode.el;w.asyncDep.catch($=>{Rn($,w,0)}).then($=>{if(w.isUnmounted||_.isUnmounted||_.pendingId!==w.suspenseId)return;ll(),w.asyncResolved=!0;const{vnode:E}=w;Qr(w,$,!1),O&&(E.el=O);const M=!O&&w.subTree.el;C(w,E,v(O||w.subTree.el),O?null:m(w.subTree),_,l,S),M&&(E.placeholder=null,k(M)),Qo(w,E.el),x&&--_.deps===0&&_.resolve()})},unmount(w,C){_.isUnmounted=!0,_.activeBranch&&h(_.activeBranch,s,w,C),_.pendingBranch&&h(_.pendingBranch,s,w,C)}};return _}function ky(e,t,s,a,n,i,l,o,r){const c=t.suspense=ph(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Sy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=au(a?s.default:s),e.ssFallback=a?au(s.fallback):_t(Lt)}function au(e){let t;if(Pe(e)){const s=wn&&e._c;s&&(e._d=!1,nl()),e=e(),s&&(e._d=!0,t=is,hh())}return Ie(e)&&(e=ry(e)),e=ws(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function fh(e,t){t&&t.pendingBranch?Ie(e)?t.effects.push(...e):t.effects.push(e):Xi(e)}function ai(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Qo(a,n))}function Ty(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),en=Symbol.for("v-txt"),Lt=Symbol.for("v-cmt"),yn=Symbol.for("v-stc"),Vi=[];let is=null;function nl(e=!1){Vi.push(is=e?null:[])}function hh(){Vi.pop(),is=Vi[Vi.length-1]||null}let wn=1;function il(e,t=!1){wn+=e,e<0&&is&&t&&(is.hasOnce=!0)}function mh(e){return e.dynamicChildren=wn>0?is||Yn:null,hh(),wn>0&&is&&is.push(e),e}function Cy(e,t,s,a,n,i){return mh(Jc(e,t,s,a,n,i,!0))}function ho(e,t,s,a,n){return mh(_t(e,t,s,a,n,!0))}function Ua(e){return e?e.__v_isVNode===!0:!1}function Js(e,t){return e.type===t.type&&e.key===t.key}function Ey(e){}const vh=({key:e})=>e??null,Zl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?He(e)||$t(e)||Pe(e)?{i:Qt,r:e,k:t,f:!!s}:e:null);function Jc(e,t=null,s=null,a=0,n=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&vh(t),ref:t&&Zl(t),scopeId:Go,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Qt};return o?(Yc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=He(s)?8:16),wn>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const _t=Ay;function Ay(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===qf)&&(e=Lt),Ua(e)){const o=pa(e,t,!0);return s&&Yc(o,s),wn>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Py(e)&&(e=e.__vccOpts),t){t=gh(t);let{class:o,style:r}=t;o&&!He(o)&&(t.class=bl(o)),ot(r)&&(yl(r)&&!Ie(r)&&(r=Je({},r)),t.style=gl(r))}const l=He(e)?1:fo(e)?128:Df(e)?64:ot(e)?4:Pe(e)?2:0;return Jc(e,t,s,a,n,l,i,!0)}function gh(e){return e?yl(e)||eh(e)?Je({},e):e:null}function pa(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?yh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&vh(c),ref:t&&t.ref?s&&i?Ie(i)?i.concat(Zl(t)):[i,Zl(t)]:Zl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&pa(e.ssContent),ssFallback:e.ssFallback&&pa(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&$a(d,r.clone(d)),d}function Zc(e=" ",t=0){return _t(en,null,e,t)}function Ry(e,t){const s=_t(yn,null,e);return s.staticCount=t,s}function bh(e="",t=!1){return t?(nl(),ho(Lt,null,e)):_t(Lt,null,e)}function ws(e){return e==null||typeof e=="boolean"?_t(Lt):Ie(e)?_t(Gt,null,e.slice()):Ua(e)?Sa(e):_t(en,null,String(e))}function Sa(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:pa(e)}function Yc(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ie(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),Yc(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!eh(t)?t._ctx=Qt:n===3&&Qt&&(Qt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Pe(t)?(t={default:t,_ctx:Qt},s=32):(t=String(t),a&64?(s=16,t=[Zc(t)]):s=8);e.children=t,e.shapeFlag|=s}function yh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=bl([t.class,a.class]));else if(n==="style")t.style=gl([t.style,a.style]);else if(Cn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ie(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Po(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function xs(e,t,s,a=null){Os(e,t,7,[s,a])}const Iy=Wf();let Oy=0;function xh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Iy,i={uid:Oy++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Rc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:sh(a,n),emitsOptions:Zf(a,n),emit:null,emitted:null,propsDefaults:Ze,inheritAttrs:a.inheritAttrs,ctx:Ze,data:Ze,props:Ze,attrs:Ze,slots:Ze,refs:Ze,setupState:Ze,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ly.bind(null,i),e.ce&&e.ce(i),i}let Yt=null;const fs=()=>Yt||Qt;let mo,ni;{const e=Bo(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};mo=t("__VUE_INSTANCE_SETTERS__",s=>Yt=s),ni=t("__VUE_SSR_SETTERS__",s=>kn=s)}const _i=e=>{const t=Yt;return mo(e),e.scope.on(),()=>{e.scope.off(),mo(t)}},ll=()=>{Yt&&Yt.scope.off(),mo(null)};function _h(e){return e.vnode.shapeFlag&4}let kn=!1;function wh(e,t=!1,s=!1){t&&ni(t);const{props:a,children:n}=e.vnode,i=_h(e);py(e,a,i,t),vy(e,n,s||t);const l=i?Ly(e,t):void 0;return t&&ni(!1),l}function Ly(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Kr);const{setup:a}=s;if(a){Ma();const n=e.setupContext=a.length>1?Th(e):null,i=_i(e),l=xi(a,e,0,[e.props,n]),o=Ac(l);if(Fa(),i(),(o||e.sp)&&!Na(e)&&Bc(e),o){if(l.then(ll,ll),t)return l.then(r=>{Qr(e,r,t)}).catch(r=>{Rn(r,e,0)});e.asyncDep=l}else Qr(e,l,t)}else Sh(e,t)}function Qr(e,t,s){Pe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ot(t)&&(e.setupState=Pc(t)),Sh(e,s)}let vo,Xr;function kh(e){vo=e,Xr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,$b))}}const Ny=()=>!vo;function Sh(e,t,s){const a=e.type;if(!e.render){if(!t&&vo&&!a.render){const n=a.template||qc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Je(Je({isCustomElement:i,delimiters:o},l),r);a.render=vo(n,c)}}e.render=a.render||Xt,Xr&&Xr(e)}{const n=_i(e);Ma();try{Qb(e)}finally{Fa(),n()}}}const Dy={get(e,t){return ns(e,"get",""),e[t]}};function Th(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Dy),slots:e.slots,emit:e.emit,expose:t}}function kl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Pc(yf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ji)return ji[s](e)},has(t,s){return s in t||s in ji}})):e.proxy}function ec(e,t=!0){return Pe(e)?e.displayName||e.name:e.name||t&&e.__name}function Py(e){return Pe(e)&&"__vccOpts"in e}const z=(e,t)=>Hg(e,t,kn);function ci(e,t,s){try{il(-1);const a=arguments.length;return a===2?ot(t)&&!Ie(t)?Ua(t)?_t(e,null,[t]):_t(e,t):_t(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&Ua(s)&&(s=[s]),_t(e,t,s))}finally{il(1)}}function My(){}function Fy(e,t,s,a){const n=s[a];if(n&&Ch(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Ch(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(qt(s[a],t[a]))return!1;return wn>0&&is&&is.push(e),!0}const Eh="3.5.38",$y=Xt,Uy=Zg,By=qn,Hy=Af,zy={createComponentInstance:xh,setupComponent:wh,renderComponentRoot:Jl,setCurrentRenderingInstance:tl,isVNode:Ua,normalizeVNode:ws,getComponentPublicInstance:kl,ensureValidVNode:Vc,pushWarningContext:Gg,popWarningContext:Kg},jy=zy,Vy=null,qy=null,Gy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let tc;const nu=typeof window<"u"&&window.trustedTypes;if(nu)try{tc=nu.createPolicy("vue",{createHTML:e=>e})}catch{}const Ah=tc?e=>tc.createHTML(e):e=>e,Ky="http://www.w3.org/2000/svg",Wy="http://www.w3.org/1998/Math/MathML",ka=typeof document<"u"?document:null,iu=ka&&ka.createElement("template"),Rh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?ka.createElementNS(Ky,e):t==="mathml"?ka.createElementNS(Wy,e):s?ka.createElement(e,{is:s}):ka.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>ka.createTextNode(e),createComment:e=>ka.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>ka.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{iu.innerHTML=Ah(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=iu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Va="transition",Ci="animation",di=Symbol("_vtc"),Ih={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Oh=Je({},Uc,Ih),Jy=e=>(e.displayName="Transition",e.props=Oh,e),Zy=Jy((e,{slots:t})=>ci(Ff,Lh(e),t)),cn=(e,t=[])=>{Ie(e)?e.forEach(s=>s(...t)):e&&e(...t)},lu=e=>e?Ie(e)?e.some(t=>t.length>1):e.length>1:!1;function Lh(e){const t={};for(const E in e)E in Ih||(t[E]=e[E]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=Yy(n),v=m&&m[0],k=m&&m[1],{onBeforeEnter:A,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:_,onBeforeAppear:w=A,onAppear:C=y,onAppearCancelled:S=g}=t,x=(E,M,V,G)=>{E._enterCancelled=G,Wa(E,M?d:o),Wa(E,M?c:l),V&&V()},O=(E,M)=>{E._isLeaving=!1,Wa(E,u),Wa(E,h),Wa(E,p),M&&M()},$=E=>(M,V)=>{const G=E?C:y,P=()=>x(M,E,V);cn(G,[M,P]),ou(()=>{Wa(M,E?r:i),na(M,E?d:o),lu(G)||ru(M,a,v,P)})};return Je(t,{onBeforeEnter(E){cn(A,[E]),na(E,i),na(E,l)},onBeforeAppear(E){cn(w,[E]),na(E,r),na(E,c)},onEnter:$(!1),onAppear:$(!0),onLeave(E,M){E._isLeaving=!0;const V=()=>O(E,M);na(E,u),E._enterCancelled?(na(E,p),sc(E)):(sc(E),na(E,p)),ou(()=>{E._isLeaving&&(Wa(E,u),na(E,h),lu(b)||ru(E,a,k,V))}),cn(b,[E,V])},onEnterCancelled(E){x(E,!1,void 0,!0),cn(g,[E])},onAppearCancelled(E){x(E,!0,void 0,!0),cn(S,[E])},onLeaveCancelled(E){O(E),cn(_,[E])}})}function Yy(e){if(e==null)return null;if(ot(e))return[xr(e.enter),xr(e.leave)];{const t=xr(e);return[t,t]}}function xr(e){return ao(e)}function na(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[di]||(e[di]=new Set)).add(t)}function Wa(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[di];s&&(s.delete(t),s.size||(e[di]=void 0))}function ou(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Qy=0;function ru(e,t,s,a){const n=e._endId=++Qy,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Nh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Nh(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${Va}Delay`),i=a(`${Va}Duration`),l=cu(n,i),o=a(`${Ci}Delay`),r=a(`${Ci}Duration`),c=cu(o,r);let d=null,u=0,p=0;t===Va?l>0&&(d=Va,u=l,p=i.length):t===Ci?c>0&&(d=Ci,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Va:Ci:null,p=d?d===Va?i.length:r.length:0);const h=d===Va&&/\b(?:transform|all)(?:,|$)/.test(a(`${Va}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function cu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>du(s)+du(e[a])))}function du(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function sc(e){return(e?e.ownerDocument:document).body.offsetHeight}function Xy(e,t,s){const a=e[di];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const go=Symbol("_vod"),Qc=Symbol("_vsh"),Dh={name:"show",beforeMount(e,{value:t},{transition:s}){e[go]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ei(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ei(e,!0),a.enter(e)):a.leave(e,()=>{Ei(e,!1)}):Ei(e,t))},beforeUnmount(e,{value:t}){Ei(e,t)}};function Ei(e,t){e.style.display=t?e[go]:"none",e[Qc]=!t}function ex(){Dh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Ph=Symbol("");function tx(e){const t=fs();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>bo(i,n))},a=()=>{const n=e(t.proxy);t.ce?bo(t.ce,n):ac(t.subTree,n),s(n)};Hc(()=>{Xi(a)}),Ge(()=>{Ut(a,Xt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>n.disconnect())})}function ac(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{ac(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)bo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>ac(s,t));else if(e.type===yn){let{el:s,anchor:a}=e;for(;s&&(bo(s,t),s!==a);)s=s.nextSibling}}function bo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=og(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Ph]=a}}const sx=/(?:^|;)\s*display\s*:/;function ax(e,t,s){const a=e.style,n=He(s);let i=!1;if(s&&!n){if(t)if(He(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&$i(a,o,"")}else for(const l in t)s[l]==null&&$i(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?ix(e,l,!He(t)&&t?t[l]:void 0,o)||$i(a,l,o):$i(a,l,"")}}else if(n){if(t!==s){const l=a[Ph];l&&(s+=";"+l),a.cssText=s,i=sx.test(s)}}else t&&e.removeAttribute("style");go in e&&(e[go]=i?a.display:"",e[Qc]&&(a.display="none"))}const uu=/\s*!important$/;function $i(e,t,s){if(Ie(s))s.forEach(a=>$i(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=nx(e,t);uu.test(s)?e.setProperty(ks(a),s.replace(uu,""),"important"):e[a]=s}}const pu=["Webkit","Moz","ms"],_r={};function nx(e,t){const s=_r[t];if(s)return s;let a=mt(t);if(a!=="filter"&&a in e)return _r[t]=a;a=An(a);for(let n=0;n<pu.length;n++){const i=pu[n]+a;if(i in e)return _r[t]=i}return t}function ix(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&He(a)&&s===a}const fu="http://www.w3.org/1999/xlink";function hu(e,t,s,a,n,i=ig(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(fu,t.slice(6,t.length)):e.setAttributeNS(fu,t,s):s==null||i&&!Qp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function mu(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ah(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Qp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Aa(e,t,s,a){e.addEventListener(t,s,a)}function lx(e,t,s,a){e.removeEventListener(t,s,a)}const vu=Symbol("_vei");function ox(e,t,s,a,n=null){const i=e[vu]||(e[vu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=rx(t);if(a){const c=i[t]=ux(a,n);Aa(e,o,c,r)}else l&&(lx(e,o,l,r),i[t]=void 0)}}const gu=/(?:Once|Passive|Capture)$/;function rx(e){let t;if(gu.test(e)){t={};let a;for(;a=e.match(gu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ks(e.slice(2)),t]}let wr=0;const cx=Promise.resolve(),dx=()=>wr||(cx.then(()=>wr=0),wr=Date.now());function ux(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ie(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Os(c,t,5,o)}}else Os(n,t,5,[a])};return s.value=e,s.attached=dx(),s}const bu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Mh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?Xy(e,a,l):t==="style"?ax(e,s,a):Cn(t)?Po(t)||ox(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):px(e,t,a,l))?(mu(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&hu(e,t,a,l,i,t!=="value")):e._isVueCE&&(fx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!He(a)))?mu(e,mt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),hu(e,t,a,l))};function px(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&bu(t)&&Pe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return bu(t)&&He(s)?!1:t in e}function fx(e,t){const s=e._def.props;if(!s)return!1;const a=mt(t);return Array.isArray(s)?s.some(n=>mt(n)===a):Object.keys(s).some(n=>mt(n)===a)}const yu={};function Fh(e,t,s){let a=_l(e,t);Mo(a)&&(a=Je({},a,t));class n extends Xo{constructor(l){super(a,l,s)}}return n.def=a,n}const hx=((e,t)=>Fh(e,t,Zh)),mx=typeof HTMLElement<"u"?HTMLElement:class{};class Xo extends mx{constructor(t,s={},a=_o){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==_o?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Xo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ot(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ie(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=ao(this._props[r])),(o||(o=Object.create(null)))[mt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)rt(this,a)||Object.defineProperty(this,a,{get:()=>da(s[a])})}_resolveProps(t){const{props:s}=t,a=Ie(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(mt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):yu;const n=mt(t);s&&this._numberProps&&this._numberProps[n]&&(a=ao(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===yu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ks(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ks(t),s+""):s||this.removeAttribute(ks(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Jh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=_t(this._def,Je(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Mo(l[0])?Je({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),ks(i)!==i&&n(ks(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function $h(e){const t=fs(),s=t&&t.ce;return s||null}function vx(){const e=$h();return e&&e.shadowRoot}function gx(e="$style"){{const t=fs();if(!t)return Ze;const s=t.type.__cssModules;if(!s)return Ze;const a=s[e];return a||Ze}}const Uh=new WeakMap,Bh=new WeakMap,yo=Symbol("_moveCb"),xu=Symbol("_enterCb"),bx=e=>(delete e.props.mode,e),yx=bx({name:"TransitionGroup",props:Je({},Oh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=fs(),a=$c();let n,i;return Jo(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Sx(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(_x),n.forEach(wx);const o=n.filter(kx);sc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;na(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[yo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[yo]=null,Wa(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=tt(e),o=Lh(l);let r=l.tag||Gt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Qc]&&(n.push(d),$a(d,ri(d,o,a,s)),Uh.set(d,Hh(d.el)))}i=t.default?Ko(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&$a(d,ri(d,o,a,s))}return _t(r,null,i)}}}),xx=yx;function _x(e){const t=e.el;t[yo]&&t[yo](),t[xu]&&t[xu]()}function wx(e){Bh.set(e,Hh(e.el))}function kx(e){const t=Uh.get(e),s=Bh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Hh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Sx(e,t,s){const a=e.cloneNode(),n=e[di];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Nh(a);return i.removeChild(a),l}const sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ie(t)?s=>ei(t,s):t};function Tx(e){e.target.composing=!0}function _u(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const zs=Symbol("_assign");function wu(e,t,s){return t&&(e=e.trim()),s&&(e=Uo(e)),e}const xo={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[zs]=sn(n);const i=a||n.props&&n.props.type==="number";Aa(e,t?"change":"input",l=>{l.target.composing||e[zs](wu(e.value,s,i))}),(s||i)&&Aa(e,"change",()=>{e.value=wu(e.value,s,i)}),t||(Aa(e,"compositionstart",Tx),Aa(e,"compositionend",_u),Aa(e,"change",_u))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[zs]=sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Uo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},Xc={deep:!0,created(e,t,s){e[zs]=sn(s),Aa(e,"change",()=>{const a=e._modelValue,n=ui(e),i=e.checked,l=e[zs];if(Ie(a)){const o=Ho(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(En(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(jh(e,i))})},mounted:ku,beforeUpdate(e,t,s){e[zs]=sn(s),ku(e,t,s)}};function ku(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ie(t))n=Ho(t,a.props.value)>-1;else if(En(t))n=t.has(a.props.value);else{if(t===s)return;n=Pa(t,jh(e,!0))}e.checked!==n&&(e.checked=n)}const ed={created(e,{value:t},s){e.checked=Pa(t,s.props.value),e[zs]=sn(s),Aa(e,"change",()=>{e[zs](ui(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[zs]=sn(a),t!==s&&(e.checked=Pa(t,a.props.value))}},zh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=En(t);Aa(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Uo(ui(l)):ui(l));e[zs](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Ot(()=>{e._assigning=!1})}),e[zs]=sn(a)},mounted(e,{value:t}){Su(e,t)},beforeUpdate(e,t,s){e[zs]=sn(s)},updated(e,{value:t}){e._assigning||Su(e,t)}};function Su(e,t){const s=e.multiple,a=Ie(t);if(!(s&&!a&&!En(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=ui(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Ho(t,o)>-1}else l.selected=t.has(o);else if(Pa(ui(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ui(e){return"_value"in e?e._value:e.value}function jh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Vh={created(e,t,s){$l(e,t,s,null,"created")},mounted(e,t,s){$l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){$l(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){$l(e,t,s,a,"updated")}};function qh(e,t){switch(e){case"SELECT":return zh;case"TEXTAREA":return xo;default:switch(t){case"checkbox":return Xc;case"radio":return ed;default:return xo}}}function $l(e,t,s,a,n){const l=qh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function Cx(){xo.getSSRProps=({value:e})=>({value:e}),ed.getSSRProps=({value:e},t)=>{if(t.props&&Pa(t.props.value,e))return{checked:!0}},Xc.getSSRProps=({value:e},t)=>{if(Ie(e)){if(t.props&&Ho(e,t.props.value)>-1)return{checked:!0}}else if(En(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Vh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=qh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Ex=["ctrl","shift","alt","meta"],Ax={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Ex.some(s=>e[`${s}Key`]&&!t.includes(s))},Rx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=Ax[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Ix={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Ox=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=ks(n.key);if(t.some(l=>l===i||Ix[l]===i))return e(n)}))},Gh=Je({patchProp:Mh},Rh);let qi,Tu=!1;function Kh(){return qi||(qi=lh(Gh))}function Wh(){return qi=Tu?qi:oh(Gh),Tu=!0,qi}const Jh=((...e)=>{Kh().render(...e)}),Lx=((...e)=>{Wh().hydrate(...e)}),_o=((...e)=>{const t=Kh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Qh(a);if(!n)return;const i=t._component;!Pe(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,Yh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),Zh=((...e)=>{const t=Wh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Qh(a);if(n)return s(n,!0,Yh(n))},t});function Yh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Qh(e){return He(e)?document.querySelector(e):e}let Cu=!1;const Nx=()=>{Cu||(Cu=!0,Cx(),ex())},Dx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ff,BaseTransitionPropsValidators:Uc,Comment:Lt,DeprecationTypes:Gy,EffectScope:Rc,ErrorCodes:Jg,ErrorTypeStrings:Uy,Fragment:Gt,KeepAlive:Ab,ReactiveEffect:Zi,Static:yn,Suspense:xy,Teleport:db,Text:en,TrackOpTypes:zg,Transition:Zy,TransitionGroup:xx,TriggerOpTypes:jg,VueElement:Xo,assertNumber:Wg,callWithAsyncErrorHandling:Os,callWithErrorHandling:xi,camelize:mt,capitalize:An,cloneVNode:pa,compatUtils:qy,computed:z,createApp:_o,createBlock:ho,createCommentVNode:bh,createElementBlock:Cy,createElementVNode:Jc,createHydrationRenderer:oh,createPropsRestProxy:Zb,createRenderer:lh,createSSRApp:Zh,createSlots:Pb,createStaticVNode:Ry,createTextVNode:Zc,createVNode:_t,customRef:_f,defineAsyncComponent:Cb,defineComponent:_l,defineCustomElement:Fh,defineEmits:Bb,defineExpose:Hb,defineModel:Vb,defineOptions:zb,defineProps:Ub,defineSSRCustomElement:hx,defineSlots:jb,devtools:By,effect:ug,effectScope:rg,getCurrentInstance:fs,getCurrentScope:sf,getCurrentWatcher:Vg,getTransitionRawChildren:Ko,guardReactiveProps:gh,h:ci,handleError:Rn,hasInjectionContext:ab,hydrate:Lx,hydrateOnIdle:xb,hydrateOnInteraction:Sb,hydrateOnMediaQuery:kb,hydrateOnVisible:wb,initCustomFormatter:My,initDirectivesForSSR:Nx,inject:Hs,isMemoSame:Ch,isProxy:yl,isReactive:La,isReadonly:ua,isRef:$t,isRuntimeOnly:Ny,isShallow:Ts,isVNode:Ua,markRaw:yf,mergeDefaults:Wb,mergeModels:Jb,mergeProps:yh,nextTick:Ot,nodeOps:Rh,normalizeClass:bl,normalizeProps:Jv,normalizeStyle:gl,onActivated:es,onBeforeMount:Bf,onBeforeUnmount:Zo,onBeforeUpdate:Hc,onDeactivated:Wt,onErrorCaptured:Vf,onMounted:Ge,onRenderTracked:jf,onRenderTriggered:zf,onScopeDispose:cg,onServerPrefetch:Hf,onUnmounted:ft,onUpdated:Jo,onWatcherCleanup:kf,openBlock:nl,patchProp:Mh,popScopeId:eb,provide:zi,proxyRefs:Pc,pushScopeId:Xg,queuePostFlushCb:Xi,reactive:an,readonly:io,ref:f,registerRuntimeCompiler:kh,render:Jh,renderList:Db,renderSlot:Mb,resolveComponent:Ob,resolveDirective:Nb,resolveDynamicComponent:Lb,resolveFilter:Vy,resolveTransitionHooks:ri,setBlockTracking:il,setDevtoolsHook:Hy,setTransitionHooks:$a,shallowReactive:Nc,shallowReadonly:Ig,shallowRef:Dc,ssrContextKey:Rf,ssrUtils:jy,stop:pg,toDisplayString:ef,toHandlerKey:Xn,toHandlers:Fb,toRaw:tt,toRef:Ug,toRefs:Mg,toValue:Ng,transformVNodeArgs:Ey,triggerRef:Lg,unref:da,useAttrs:Kb,useCssModule:gx,useCssVars:tx,useHost:$h,useId:pb,useModel:iy,useSSRContext:If,useShadowRoot:vx,useSlots:Gb,useTemplateRef:fb,useTransitionState:$c,vModelCheckbox:Xc,vModelDynamic:Vh,vModelRadio:ed,vModelSelect:zh,vModelText:xo,vShow:Dh,version:Eh,warn:$y,watch:Ut,watchEffect:nb,watchPostEffect:ib,watchSyncEffect:Of,withAsyncContext:Yb,withCtx:Fc,withDefaults:qb,withDirectives:sb,withKeys:Ox,withMemo:Fy,withModifiers:Rx,withScopeId:tb},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ol=Symbol(""),Gi=Symbol(""),td=Symbol(""),wo=Symbol(""),Xh=Symbol(""),Sn=Symbol(""),em=Symbol(""),tm=Symbol(""),sd=Symbol(""),ad=Symbol(""),Sl=Symbol(""),nd=Symbol(""),sm=Symbol(""),id=Symbol(""),ld=Symbol(""),od=Symbol(""),rd=Symbol(""),cd=Symbol(""),dd=Symbol(""),am=Symbol(""),nm=Symbol(""),er=Symbol(""),ko=Symbol(""),ud=Symbol(""),pd=Symbol(""),rl=Symbol(""),Tl=Symbol(""),fd=Symbol(""),nc=Symbol(""),Px=Symbol(""),ic=Symbol(""),So=Symbol(""),Mx=Symbol(""),Fx=Symbol(""),hd=Symbol(""),$x=Symbol(""),Ux=Symbol(""),md=Symbol(""),im=Symbol(""),pi={[ol]:"Fragment",[Gi]:"Teleport",[td]:"Suspense",[wo]:"KeepAlive",[Xh]:"BaseTransition",[Sn]:"openBlock",[em]:"createBlock",[tm]:"createElementBlock",[sd]:"createVNode",[ad]:"createElementVNode",[Sl]:"createCommentVNode",[nd]:"createTextVNode",[sm]:"createStaticVNode",[id]:"resolveComponent",[ld]:"resolveDynamicComponent",[od]:"resolveDirective",[rd]:"resolveFilter",[cd]:"withDirectives",[dd]:"renderList",[am]:"renderSlot",[nm]:"createSlots",[er]:"toDisplayString",[ko]:"mergeProps",[ud]:"normalizeClass",[pd]:"normalizeStyle",[rl]:"normalizeProps",[Tl]:"guardReactiveProps",[fd]:"toHandlers",[nc]:"camelize",[Px]:"capitalize",[ic]:"toHandlerKey",[So]:"setBlockTracking",[Mx]:"pushScopeId",[Fx]:"popScopeId",[hd]:"withCtx",[$x]:"unref",[Ux]:"isRef",[md]:"withMemo",[im]:"isMemoSame"};function Bx(e){Object.getOwnPropertySymbols(e).forEach(t=>{pi[t]=e[t]})}const Ns={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Hx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ns}}function cl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Ns){return e&&(o?(e.helper(Sn),e.helper(mi(e.inSSR,c))):e.helper(hi(e.inSSR,c)),l&&e.helper(cd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function xn(e,t=Ns){return{type:17,loc:t,elements:e}}function Bs(e,t=Ns){return{type:15,loc:t,properties:e}}function Ft(e,t){return{type:16,loc:Ns,key:He(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Ns,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Ys(e,t=Ns){return{type:8,loc:t,children:e}}function jt(e,t=[],s=Ns){return{type:14,loc:s,callee:e,arguments:t}}function fi(e,t=void 0,s=!1,a=!1,n=Ns){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function lc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Ns}}function zx(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Ns}}function jx(e){return{type:21,body:e,loc:Ns}}function hi(e,t){return e||t?sd:ad}function mi(e,t){return e||t?em:tm}function vd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(hi(a,e.isComponent)),t(Sn),t(mi(a,e.isComponent)))}const Eu=new Uint8Array([123,123]),Au=new Uint8Array([125,125]);function Ru(e){return e>=97&&e<=122||e>=65&&e<=90}function Rs(e){return e===32||e===10||e===9||e===12||e===13}function qa(e){return e===47||e===62||Rs(e)}function To(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Vx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Eu,this.delimiterClose=Au,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Eu,this.delimiterClose=Au}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?qa(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Rs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Ru(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){qa(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(qa(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(To("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Rs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Ru(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Rs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Rs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Rs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||qa(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||qa(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||qa(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||qa(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||qa(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Rs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Rs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Rs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Iu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function _n(e,t){const s=Iu("MODE",t),a=Iu(e,t);return s===3?a===!0:a!==!1}function dl(e,t,s,...a){return _n(e,t)}function gd(e){throw e}function lm(e){}function xt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Ss=e=>e.type===4&&e.isStatic;function om(e){switch(e){case"Teleport":case"teleport":return Gi;case"Suspense":case"suspense":return td;case"KeepAlive":case"keep-alive":return wo;case"BaseTransition":case"base-transition":return Xh}}const qx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,bd=e=>!qx.test(e),rm=/[A-Za-z_$\xA0-\uFFFF]/,Gx=/[\.\?\w$\xA0-\uFFFF]/,Kx=/\s+[.[]\s*|\s*[.[]\s+/g,cm=e=>e.type===4?e.content:e.loc.source,Wx=e=>{const t=cm(e).trim().replace(Kx,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?rm:Gx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},dm=Wx,Jx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Zx=e=>Jx.test(cm(e)),Yx=Zx;function Us(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(He(t)?n.name===t:t.test(n.name)))return n}}function tr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&hn(i.arg,t))return i}}function hn(e,t){return!!(e&&Ss(e)&&e.content===t)}function Qx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function kr(e){return e.type===5||e.type===2}function Ou(e){return e.type===7&&e.name==="pre"}function Xx(e){return e.type===7&&e.name==="slot"}function Co(e){return e.type===1&&e.tagType===3}function Eo(e){return e.type===1&&e.tagType===2}const e0=new Set([rl,Tl]);function um(e,t=[]){if(e&&!He(e)&&e.type===14){const s=e.callee;if(!He(s)&&e0.has(s))return um(e.arguments[0],t.concat(e))}return[e,t]}function Ao(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!He(n)&&n.type===14){const o=um(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||He(n))a=Bs([t]);else if(n.type===14){const o=n.arguments[0];!He(o)&&o.type===15?Lu(t,o)||o.properties.unshift(t):n.callee===fd?a=jt(s.helper(ko),[Bs([t]),n]):n.arguments.unshift(Bs([t])),!a&&(a=n)}else n.type===15?(Lu(t,n)||n.properties.unshift(t),a=n):(a=jt(s.helper(ko),[Bs([t]),n]),l&&l.callee===Tl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Lu(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function ul(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function t0(e){return e.type===14&&e.callee===md?e.arguments[1].returns:e}const s0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function pm(e){for(let t=0;t<e.length;t++)if(!Rs(e.charCodeAt(t)))return!1;return!0}function yd(e){return e.type===2&&pm(e.content)||e.type===12&&yd(e.content)}function fm(e){return e.type===3||yd(e)}const hm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Wn,isPreTag:Wn,isIgnoreNewlineTag:Wn,isCustomElement:Wn,onError:gd,onWarn:lm,comments:!1,prefixIdentifiers:!1};let lt=hm,pl=null,Da="",as=null,Xe=null,ys="",wa=-1,un=-1,xd=0,Ya=!1,oc=null;const yt=[],At=new Vx(yt,{onerr:ya,ontext(e,t){Ul(Zt(e,t),e,t)},ontextentity(e,t,s){Ul(e,t,s)},oninterpolation(e,t){if(Ya)return Ul(Zt(e,t),e,t);let s=e+At.delimiterOpen.length,a=t-At.delimiterClose.length;for(;Rs(Da.charCodeAt(s));)s++;for(;Rs(Da.charCodeAt(a-1));)a--;let n=Zt(s,a);n.includes("&")&&(n=lt.decodeEntities(n,!1)),rc({type:5,content:Ql(n,!1,It(s,a)),loc:It(e,t)})},onopentagname(e,t){const s=Zt(e,t);as={type:1,tag:s,ns:lt.getNamespace(s,yt[0],lt.ns),tagType:0,props:[],children:[],loc:It(e-1,t),codegenNode:void 0}},onopentagend(e){Du(e)},onclosetag(e,t){const s=Zt(e,t);if(!lt.isVoidTag(s)){let a=!1;for(let n=0;n<yt.length;n++)if(yt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ya(24,yt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=yt.shift();Yl(o,t,l<n)}break}a||ya(23,mm(e,60))}},onselfclosingtag(e){const t=as.tag;as.isSelfClosing=!0,Du(e),yt[0]&&yt[0].tag===t&&Yl(yt.shift(),e)},onattribname(e,t){Xe={type:6,name:Zt(e,t),nameLoc:It(e,t),value:void 0,loc:It(e)}},ondirname(e,t){const s=Zt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ya&&a===""&&ya(26,e),Ya||a==="")Xe={type:6,name:s,nameLoc:It(e,t),value:void 0,loc:It(e)};else if(Xe={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:It(e)},a==="pre"){Ya=At.inVPre=!0,oc=as;const n=as.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=p0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Zt(e,t);if(Ya&&!Ou(Xe))Xe.name+=s,mn(Xe.nameLoc,t);else{const a=s[0]!=="[";Xe.arg=Ql(a?s:s.slice(1,-1),a,It(e,t),a?3:0)}},ondirmodifier(e,t){const s=Zt(e,t);if(Ya&&!Ou(Xe))Xe.name+="."+s,mn(Xe.nameLoc,t);else if(Xe.name==="slot"){const a=Xe.arg;a&&(a.content+="."+s,mn(a.loc,t))}else{const a=Ve(s,!0,It(e,t));Xe.modifiers.push(a)}},onattribdata(e,t){ys+=Zt(e,t),wa<0&&(wa=e),un=t},onattribentity(e,t,s){ys+=e,wa<0&&(wa=t),un=s},onattribnameend(e){const t=Xe.loc.start.offset,s=Zt(t,e);Xe.type===7&&(Xe.rawName=s),as.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ya(2,t)},onattribend(e,t){if(as&&Xe){if(mn(Xe.loc,t),e!==0)if(ys.includes("&")&&(ys=lt.decodeEntities(ys,!0)),Xe.type===6)Xe.name==="class"&&(ys=gm(ys).trim()),e===1&&!ys&&ya(13,t),Xe.value={type:2,content:ys,loc:e===1?It(wa,un):It(wa-1,un+1)},At.inSFCRoot&&as.tag==="template"&&Xe.name==="lang"&&ys&&ys!=="html"&&At.enterRCDATA(To("</template"),0);else{let s=0;Xe.exp=Ql(ys,!1,It(wa,un),0,s),Xe.name==="for"&&(Xe.forParseResult=n0(Xe.exp));let a=-1;Xe.name==="bind"&&(a=Xe.modifiers.findIndex(n=>n.content==="sync"))>-1&&dl("COMPILER_V_BIND_SYNC",lt,Xe.loc,Xe.arg.loc.source)&&(Xe.name="model",Xe.modifiers.splice(a,1))}(Xe.type!==7||Xe.name!=="pre")&&as.props.push(Xe)}ys="",wa=un=-1},oncomment(e,t){lt.comments&&rc({type:3,content:Zt(e,t),loc:It(e-4,t+3)})},onend(){const e=Da.length;for(let t=0;t<yt.length;t++)Yl(yt[t],e-1),ya(24,yt[t].loc.start.offset)},oncdata(e,t){(yt[0]?yt[0].ns:lt.ns)!==0?Ul(Zt(e,t),e,t):ya(1,e-9)},onprocessinginstruction(e){(yt[0]?yt[0].ns:lt.ns)===0&&ya(21,e-1)}}),Nu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,a0=/^\(|\)$/g;function n0(e){const t=e.loc,s=e.content,a=s.match(s0);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Ql(u,!1,It(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(a0,"").trim();const c=n.indexOf(r),d=r.match(Nu);if(d){r=r.replace(Nu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Zt(e,t){return Da.slice(e,t)}function Du(e){At.inSFCRoot&&(as.innerLoc=It(e+1,e+1)),rc(as);const{tag:t,ns:s}=as;s===0&&lt.isPreTag(t)&&xd++,lt.isVoidTag(t)?Yl(as,e):(yt.unshift(as),(s===1||s===2)&&(At.inXML=!0)),as=null}function Ul(e,t,s){{const i=yt[0]&&yt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=lt.decodeEntities(e,!1))}const a=yt[0]||pl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,mn(n.loc,s)):a.children.push({type:2,content:e,loc:It(t,s)})}function Yl(e,t,s=!1){s?mn(e.loc,mm(t,60)):mn(e.loc,i0(t,62)+1),At.inSFCRoot&&(e.children.length?e.innerLoc.end=Je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Je({},e.innerLoc.start),e.innerLoc.source=Zt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Ya||(a==="slot"?e.tagType=2:Pu(e)?e.tagType=3:o0(e)&&(e.tagType=1)),At.inRCDATA||(e.children=vm(i)),n===0&&lt.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&lt.isPreTag(a)&&xd--,oc===e&&(Ya=At.inVPre=!1,oc=null),At.inXML&&(yt[0]?yt[0].ns:lt.ns)===0&&(At.inXML=!1);{const l=e.props;if(!At.inSFCRoot&&_n("COMPILER_NATIVE_TEMPLATE",lt)&&e.tag==="template"&&!Pu(e)){const r=yt[0]||pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&dl("COMPILER_INLINE_TEMPLATE",lt,o.loc)&&e.children.length&&(o.value={type:2,content:Zt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function i0(e,t){let s=e;for(;Da.charCodeAt(s)!==t&&s<Da.length-1;)s++;return s}function mm(e,t){let s=e;for(;Da.charCodeAt(s)!==t&&s>=0;)s--;return s}const l0=new Set(["if","else","else-if","for","slot"]);function Pu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&l0.has(t[s].name))return!0}return!1}function o0({tag:e,props:t}){if(lt.isCustomElement(e))return!1;if(e==="component"||r0(e.charCodeAt(0))||om(e)||lt.isBuiltInComponent&&lt.isBuiltInComponent(e)||lt.isNativeTag&&!lt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(dl("COMPILER_IS_ON_ELEMENT",lt,a.loc))return!0}}else if(a.name==="bind"&&hn(a.arg,"is")&&dl("COMPILER_IS_ON_ELEMENT",lt,a.loc))return!0}return!1}function r0(e){return e>64&&e<91}const c0=/\r\n/g;function vm(e){const t=lt.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(xd)n.content=n.content.replace(c0,`
`);else if(pm(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&d0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=gm(n.content))}return s?e.filter(Boolean):e}function d0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function gm(e){let t="",s=!1;for(let a=0;a<e.length;a++)Rs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function rc(e){(yt[0]||pl).children.push(e)}function It(e,t){return{start:At.getPos(e),end:t==null?t:At.getPos(t),source:t==null?t:Zt(e,t)}}function u0(e){return It(e.start.offset,e.end.offset)}function mn(e,t){e.end=At.getPos(t),e.source=Zt(e.start.offset,t)}function p0(e){const t={type:6,name:e.rawName,nameLoc:It(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Ql(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ya(e,t,s){lt.onError(xt(e,It(t,t)))}function f0(){At.reset(),as=null,Xe=null,ys="",wa=-1,un=-1,yt.length=0}function h0(e,t){if(f0(),Da=e,lt=Je({},hm),t){let n;for(n in t)t[n]!=null&&(lt[n]=t[n])}At.mode=lt.parseMode==="html"?1:lt.parseMode==="sfc"?2:0,At.inXML=lt.ns===1||lt.ns===2;const s=t&&t.delimiters;s&&(At.delimiterOpen=To(s[0]),At.delimiterClose=To(s[1]));const a=pl=Hx([],e);return At.parse(Da),a.loc=It(0,e.length),a.children=vm(a.children),pl=null,a}function m0(e,t){Xl(e,void 0,t,!!bm(e))}function bm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Eo(t[0])?t[0]:null}function Xl(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Is(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&xm(u,s)>=2){const v=_m(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:Is(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Xl(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Xl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Xl(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ie(e.codegenNode.children))e.codegenNode.children=r(xn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ie(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(xn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ie(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Us(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(xn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ie(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Is(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=xm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Is(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Is(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Sn),t.removeHelper(mi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(hi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Is(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(He(o)||os(o))continue;const r=Is(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const v0=new Set([ud,pd,rl,Tl]);function ym(e,t){if(e.type===14&&!He(e.callee)&&v0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Is(s,t);if(s.type===14)return ym(s,t)}return 0}function xm(e,t){let s=3;const a=_m(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Is(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Is(o,t):o.type===14?c=ym(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function _m(e){const t=e.codegenNode;if(t.type===13)return t.props}function g0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Xt,isCustomElement:d=Xt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:k="",bindingMetadata:A=Ze,inline:y=!1,isTS:g=!1,onError:b=gd,onWarn:_=lm,compatConfig:w}){const C=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:C&&An(mt(C[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:k,bindingMetadata:A,inline:y,isTS:g,onError:b,onWarn:_,compatConfig:w,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const O=S.helpers.get(x)||0;return S.helpers.set(x,O+1),x},removeHelper(x){const O=S.helpers.get(x);if(O){const $=O-1;$?S.helpers.set(x,$):S.helpers.delete(x)}},helperString(x){return`_${pi[S.helper(x)]}`},replaceNode(x){S.parent.children[S.childIndex]=S.currentNode=x},removeNode(x){const O=S.parent.children,$=x?O.indexOf(x):S.currentNode?S.childIndex:-1;!x||x===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>$&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice($,1)},onNodeRemoved:Xt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){He(x)&&(x=Ve(x)),S.hoists.push(x);const O=Ve(`_hoisted_${S.hoists.length}`,!1,x.loc,2);return O.hoisted=x,O},cache(x,O=!1,$=!1){const E=zx(S.cached.length,x,O,$);return S.cached.push(E),E}};return S.filters=new Set,S}function b0(e,t){const s=g0(e,t);sr(e,s),t.hoistStatic&&m0(e,s),t.ssr||y0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function y0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=bm(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&vd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=cl(t,s(ol),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function x0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];He(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,sr(n,t))}}function sr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ie(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Sl);break;case 5:t.ssr||t.helper(er);break;case 9:for(let i=0;i<e.branches.length;i++)sr(e.branches[i],t);break;case 10:case 11:case 1:case 0:x0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function wm(e,t){const s=He(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(Xx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const ar="/*@__PURE__*/",km=e=>`${pi[e]}: _${pi[e]}`;function _0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${pi[v]}`},push(v,k=-2,A){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function w0(e,t={}){const s=_0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";k0(e,s);const v=d?"ssrRender":"render",A=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${v}(${A}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(km).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Sr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Sr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Sr(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?ls(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function k0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[sd,ad,Sl,nd,sm].filter(p=>d.includes(p)).map(km).join(", ");n(`const { ${u} } = _Vue
`,-1)}S0(e.hoists,t),i(),n("return ")}function Sr(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?rd:t==="component"?id:od);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${ul(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function S0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),ls(i,t),a())}t.pure=!1}function _d(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Cl(e,t,s),s&&t.deindent(),t.push("]")}function Cl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];He(o)?n(o,-3):Ie(o)?_d(o,t):ls(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function ls(e,t){if(He(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:T0(e,t);break;case 4:Sm(e,t);break;case 5:C0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:Tm(e,t);break;case 3:A0(e,t);break;case 13:R0(e,t);break;case 14:O0(e,t);break;case 15:L0(e,t);break;case 17:N0(e,t);break;case 18:D0(e,t);break;case 19:P0(e,t);break;case 20:M0(e,t);break;case 21:Cl(e.body,t,!0,!1);break}}function T0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Sm(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function C0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(ar),s(`${a(er)}(`),ls(e.content,t),s(")")}function Tm(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];He(a)?t.push(a,-3):ls(a,t)}}function E0(e,t){const{push:s}=t;if(e.type===8)s("["),Tm(e,t),s("]");else if(e.isStatic){const a=bd(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function A0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(ar),s(`${a(Sl)}(${JSON.stringify(e.content)})`,-3,e)}function R0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(cd)+"("),u&&s(`(${a(Sn)}(${p?"true":""}), `),n&&s(ar);const v=u?mi(t.inSSR,h):hi(t.inSSR,h);s(a(v)+"(",-2,e),Cl(I0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function I0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function O0(e,t){const{push:s,helper:a,pure:n}=t,i=He(e.callee)?e.callee:a(e.callee);n&&s(ar),s(i+"(",-2,e),Cl(e.arguments,t),s(")")}function L0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];E0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function N0(e,t){_d(e.elements,t)}function D0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${pi[hd]}(`),s("(",-2,e),Ie(i)?Cl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ie(l)?_d(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function P0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!bd(s.content);u&&l("("),Sm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,ls(n,t),d||t.indentLevel--,i&&r(!0)}function M0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(So)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(So)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const F0=wm(/^(?:if|else|else-if)$/,(e,t,s)=>$0(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Fu(n,r,s);else{const c=U0(a.codegenNode);c.alternate=Fu(n,r+a.branches.length-1,s)}}}));function $0(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(xt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=Mu(e,t),i={type:9,loc:u0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&fm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(xt(30,e.loc)),s.removeNode();const o=Mu(e,t);l.branches.push(o);const r=a&&a(l,o,!1);sr(o,s),r&&r(),s.currentNode=null}else s.onError(xt(30,e.loc));break}}}function Mu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Us(e,"for")?e.children:[e],userKey:tr(e,"key"),isTemplateIf:s}}function Fu(e,t,s){return e.condition?lc(e.condition,$u(e,t,s),jt(s.helper(Sl),['""',"true"])):$u(e,t,s)}function $u(e,t,s){const{helper:a}=s,n=Ft("key",Ve(`${t}`,!1,Ns,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Ao(r,n,s),r}else return cl(s,a(ol),Bs([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=t0(r);return c.type===13&&vd(c,s),Ao(c,n,s),r}}function U0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const B0=wm("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return H0(e,t,s,i=>{const l=jt(a(dd),[i.source]),o=Co(e),r=Us(e,"memo"),c=tr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Ft("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=cl(s,a(ol),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,k=v.length!==1||v[0].type!==1,A=Eo(e)?e:o&&e.children.length===1&&Eo(e.children[0])?e.children[0]:null;if(A?(m=A.codegenNode,o&&u&&Ao(m,u,s)):k?m=cl(s,a(ol),u?Bs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Ao(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Sn),n(mi(s.inSSR,m.isComponent))):n(hi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Sn),a(mi(s.inSSR,m.isComponent))):a(hi(s.inSSR,m.isComponent))),r){const y=fi(cc(i.parseResult,[Ve("_cached")]));y.body=jx([Ys(["const _memo = (",r.exp,")"]),Ys(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(im)}(_cached, _memo)) return _cached`]),Ys(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(y,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(fi(cc(i.parseResult),m,!0))}})});function H0(e,t,s,a){if(!t.exp){s.onError(xt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(xt(32,t.loc));return}Cm(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Co(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function Cm(e,t){e.finalized||(e.finalized=!0)}function cc({value:e,key:t,index:s},a=[]){return z0([e,t,s,...a])}function z0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const Uu=Ve("undefined",!1),j0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Us(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},V0=(e,t,s,a)=>fi(e,s,!1,!0,s.length?s[0].loc:a);function q0(e,t,s=V0){t.helper(hd);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Us(e,"slot",!0);if(r){const{arg:k,exp:A}=r;k&&!Ss(k)&&(o=!0),i.push(Ft(k||Ve("default",!0),s(A,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let k=0;k<a.length;k++){const A=a[k];let y;if(!Co(A)||!(y=Us(A,"slot",!0))){A.type!==3&&u.push(A);continue}if(r){t.onError(xt(37,y.loc));break}c=!0;const{children:g,loc:b}=A,{arg:_=Ve("default",!0),exp:w,loc:C}=y;let S;Ss(_)?S=_?_.content:"default":o=!0;const x=Us(A,"for"),O=s(w,x,g,b);let $,E;if($=Us(A,"if"))o=!0,l.push(lc($.exp,Bl(_,O,h++),Uu));else if(E=Us(A,/^else(?:-if)?$/,!0)){let M=k,V;for(;M--&&(V=a[M],!!fm(V)););if(V&&Co(V)&&Us(V,/^(?:else-)?if$/)){let G=l[l.length-1];for(;G.alternate.type===19;)G=G.alternate;G.alternate=E.exp?lc(E.exp,Bl(_,O,h++),Uu):Bl(_,O,h++)}else t.onError(xt(30,E.loc))}else if(x){o=!0;const M=x.forParseResult;M?(Cm(M),l.push(jt(t.helper(dd),[M.source,fi(cc(M),Bl(_,O),!0)]))):t.onError(xt(32,x.loc))}else{if(S){if(p.has(S)){t.onError(xt(38,C));continue}p.add(S),S==="default"&&(d=!0)}i.push(Ft(_,O))}}if(!r){const k=(A,y)=>{const g=s(A,void 0,y,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Ft("default",g)};c?u.length&&!u.every(yd)&&(d?t.onError(xt(39,u[0].loc)):i.push(k(void 0,u))):i.push(k(void 0,a))}const m=o?2:eo(e.children)?3:1;let v=Bs(i.concat(Ft("_",Ve(m+"",!1))),n);return l.length&&(v=jt(t.helper(nm),[v,xn(l)])),{slots:v,hasDynamicSlots:o}}function Bl(e,t,s){const a=[Ft("name",e),Ft("fn",t)];return s!=null&&a.push(Ft("key",Ve(String(s),!0))),Bs(a)}function eo(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||eo(s.children))return!0;break;case 9:if(eo(s.branches))return!0;break;case 10:case 11:if(eo(s.children))return!0;break}}return!1}const Em=new WeakMap,G0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?K0(e,t):`"${a}"`;const o=ot(l)&&l.callee===ld;let r,c,d=0,u,p,h,m=o||l===Gi||l===td||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const v=Am(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const k=v.directives;h=k&&k.length?xn(k.map(A=>J0(A,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===wo&&(m=!0,d|=1024),i&&l!==Gi&&l!==wo){const{slots:k,hasDynamicSlots:A}=q0(e,t);c=k,A&&(d|=1024)}else if(e.children.length===1&&l!==Gi){const k=e.children[0],A=k.type,y=A===5||A===8;y&&Is(k,t)===0&&(d|=1),y||A===2?c=k:c=e.children}else c=e.children;p&&p.length&&(u=Z0(p)),e.codegenNode=cl(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function K0(e,t,s=!1){let{tag:a}=e;const n=dc(a),i=tr(e,"is",!1,!0);if(i)if(n||_n("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return jt(t.helper(ld),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=om(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(id),t.components.add(a),ul(a,"component"))}function Am(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,k=!1,A=!1,y=!1,g=!1,b=!1;const _=[],w=O=>{c.length&&(d.push(Bs(Bu(c),o)),c=[]),O&&d.push(O)},C=()=>{t.scopes.vFor>0&&c.push(Ft(Ve("ref_for",!0),Ve("true")))},S=({key:O,value:$})=>{if(Ss(O)){const E=O.content,M=Cn(E);if(M&&(!a||n)&&E.toLowerCase()!=="onclick"&&E!=="onUpdate:modelValue"&&!Oa(E)&&(y=!0),M&&Oa(E)&&(b=!0),M&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&Is($,t)>0)return;E==="ref"?v=!0:E==="class"?k=!0:E==="style"?A=!0:E!=="key"&&!_.includes(E)&&_.push(E),a&&(E==="class"||E==="style")&&!_.includes(E)&&_.push(E)}else g=!0};for(let O=0;O<s.length;O++){const $=s[O];if($.type===6){const{loc:E,name:M,nameLoc:V,value:G}=$;let P=!0;if(M==="ref"&&(v=!0,C()),M==="is"&&(dc(l)||G&&G.content.startsWith("vue:")||_n("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Ft(Ve(M,!0,V),Ve(G?G.content:"",P,G?G.loc:E)))}else{const{name:E,arg:M,exp:V,loc:G,modifiers:P}=$,L=E==="bind",N=E==="on";if(E==="slot"){a||t.onError(xt(40,G));continue}if(E==="once"||E==="memo"||E==="is"||L&&hn(M,"is")&&(dc(l)||_n("COMPILER_IS_ON_ELEMENT",t))||N&&i)continue;if((L&&hn(M,"key")||N&&p&&hn(M,"vue:before-update"))&&(h=!0),L&&hn(M,"ref")&&C(),!M&&(L||N)){if(g=!0,V)if(L){if(w(),_n("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}C(),w(),d.push(V)}else w({type:14,loc:G,callee:t.helper(fd),arguments:a?[V]:[V,"true"]});else t.onError(xt(L?34:35,G));continue}L&&P.some(le=>le.content==="prop")&&(m|=32);const ne=t.directiveTransforms[E];if(ne){const{props:le,needRuntime:U}=ne($,e,t);!i&&le.forEach(S),N&&M&&!Ss(M)?w(Bs(le,o)):c.push(...le),U&&(u.push($),os(U)&&Em.set($,U))}else Bv(E)||(u.push($),p&&(h=!0))}}let x;if(d.length?(w(),d.length>1?x=jt(t.helper(ko),d,o):x=d[0]):c.length&&(x=Bs(Bu(c),o)),g?m|=16:(k&&!a&&(m|=2),A&&!a&&(m|=4),_.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let O=-1,$=-1,E=!1;for(let G=0;G<x.properties.length;G++){const P=x.properties[G].key;Ss(P)?P.content==="class"?O=G:P.content==="style"&&($=G):P.isHandlerKey||(E=!0)}const M=x.properties[O],V=x.properties[$];E?x=jt(t.helper(rl),[x]):(M&&!Ss(M.value)&&(M.value=jt(t.helper(ud),[M.value])),V&&(A||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=jt(t.helper(pd),[V.value])));break;case 14:break;default:x=jt(t.helper(rl),[jt(t.helper(Tl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:_,shouldUseBlock:h}}function Bu(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Cn(i))&&W0(l,n):(t.set(i,n),s.push(n))}return s}function W0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=xn([e.value,t.value],e.loc)}function J0(e,t){const s=[],a=Em.get(e);a?s.push(t.helperString(a)):(t.helper(od),t.directives.add(e.name),s.push(ul(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push(Bs(e.modifiers.map(l=>Ft(l,i)),n))}return xn(s,e.loc)}function Z0(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function dc(e){return e==="component"||e==="Component"}const Y0=(e,t)=>{if(Eo(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Q0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=fi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=jt(t.helper(am),l,a)}};function Q0(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=mt(l.name),n.push(l)));else if(l.name==="bind"&&hn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=mt(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Ss(l.arg)&&(l.arg.content=mt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Am(e,t,n,!1,!1);a=i,l.length&&t.onError(xt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Rm=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(xt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Xn(mt(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Ys([`${s.helperString(ic)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(ic)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=dm(r),p=!(u||Yx(r)),h=r.content.includes(";");(p||c&&u)&&(r=Ys([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Ft(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},X0=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=mt(i.content):i.content=`${s.helperString(nc)}(${i.content})`:(i.children.unshift(`${s.helperString(nc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Hu(i,"."),a.some(o=>o.content==="attr")&&Hu(i,"^")),{props:[Ft(i,l)]}},Hu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},e_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(kr(r))a||(a=s[i]=Ys([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Is(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:jt(t.helper(nd),o)}}}}},zu=new WeakSet,t_=(e,t)=>{if(e.type===1&&Us(e,"once",!0))return zu.has(e)||t.inVOnce||t.inSSR?void 0:(zu.add(e),t.inVOnce=!0,t.helper(So),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Im=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(xt(41,e.loc)),Ai();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(xt(44,a.loc)),Ai();if(o==="literal-const"||o==="setup-const")return s.onError(xt(45,a.loc)),Ai();if(!l.trim()||!dm(a))return s.onError(xt(42,a.loc)),Ai();const r=n||Ve("modelValue",!0),c=n?Ss(n)?`onUpdate:${mt(n.content)}`:Ys(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ys([`${u} => ((`,a,") = $event)"]);const p=[Ft(r,e.exp),Ft(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(bd(v)?v:JSON.stringify(v))+": true").join(", "),m=n?Ss(n)?`${n.content}Modifiers`:Ys([n,' + "Modifiers"']):"modelModifiers";p.push(Ft(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ai(p)};function Ai(e=[]){return{props:e}}const s_=/[\w).+\-_$\]]/,a_=(e,t)=>{_n("COMPILER_FILTERS",t)&&(e.type===5?Ro(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Ro(s.exp,t)}))};function Ro(e,t){if(e.type===4)ju(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?ju(a,t):a.type===8?Ro(e,t):a.type===5&&Ro(a.content,t))}}function ju(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):k();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let A=h-1,y;for(;A>=0&&(y=s.charAt(A),y===" ");A--);(!y||!s_.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&k();function k(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=n_(m,v[h],t);e.content=m,e.ast=void 0}}function n_(e,t,s){s.helper(rd);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${ul(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${ul(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Vu=new WeakSet,i_=(e,t)=>{if(e.type===1){const s=Us(e,"memo");return!s||Vu.has(e)||t.inSSR?void 0:(Vu.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&vd(a,t),e.codegenNode=jt(t.helper(md),[s.exp,fi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},l_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(xt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=mt(a.content);(rm.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function o_(e){return[[l_,t_,F0,i_,B0,a_,Y0,G0,j0,e_],{on:Rm,bind:X0,model:Im}]}function r_(e,t={}){const s=t.onError||gd,a=t.mode==="module";t.prefixIdentifiers===!0?s(xt(48)):a&&s(xt(49));const n=!1;t.cacheHandlers&&s(xt(50)),t.scopeId&&!a&&s(xt(51));const i=Je({},t,{prefixIdentifiers:n}),l=He(e)?h0(e,i):e,[o,r]=o_();return b0(l,Je({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Je({},r,t.directiveTransforms||{})})),w0(l,i)}const c_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Om=Symbol(""),Lm=Symbol(""),Nm=Symbol(""),Dm=Symbol(""),uc=Symbol(""),Pm=Symbol(""),Mm=Symbol(""),Fm=Symbol(""),$m=Symbol(""),Um=Symbol("");Bx({[Om]:"vModelRadio",[Lm]:"vModelCheckbox",[Nm]:"vModelText",[Dm]:"vModelSelect",[uc]:"vModelDynamic",[Pm]:"withModifiers",[Mm]:"withKeys",[Fm]:"vShow",[$m]:"Transition",[Um]:"TransitionGroup"});let Bn;function d_(e,t=!1){return Bn||(Bn=document.createElement("div")),t?(Bn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Bn.children[0].getAttribute("foo")):(Bn.innerHTML=e,Bn.textContent)}const u_={parseMode:"html",isVoidTag:ag,isNativeTag:e=>eg(e)||tg(e)||sg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:d_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return $m;if(e==="TransitionGroup"||e==="transition-group")return Um},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},p_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:f_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},f_=(e,t)=>{const s=Yp(e);return Ve(JSON.stringify(s),!1,t,3)};function tn(e,t){return xt(e,t)}const h_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(54,n)),t.children.length&&(s.onError(tn(55,n)),t.children.length=0),{props:[Ft(Ve("innerHTML",!0,n),a||Ve("",!0))]}},m_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(56,n)),t.children.length&&(s.onError(tn(57,n)),t.children.length=0),{props:[Ft(Ve("textContent",!0),a?Is(a,s)>0?a:jt(s.helperString(er),[a],n):Ve("",!0))]}},v_=(e,t,s)=>{const a=Im(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(tn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Nm,o=!1;if(n==="input"||i){const r=tr(t,"type");if(r){if(r.type===7)l=uc;else if(r.value)switch(r.value.content){case"radio":l=Om;break;case"checkbox":l=Lm;break;case"file":o=!0,s.onError(tn(60,e.loc));break}}else Qx(t)&&(l=uc)}else n==="select"&&(l=Dm);o||(a.needRuntime=s.helper(l))}else s.onError(tn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},g_=Ls("passive,once,capture"),b_=Ls("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),y_=Ls("left,right"),Bm=Ls("onkeyup,onkeydown,onkeypress"),x_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&dl("COMPILER_V_ON_NATIVE",s)||g_(r)?l.push(r):y_(r)?Ss(e)?Bm(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):b_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},qu=(e,t)=>Ss(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Ys(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,__=(e,t,s)=>Rm(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=x_(i,n,s,e.loc);if(r.includes("right")&&(i=qu(i,"onContextmenu")),r.includes("middle")&&(i=qu(i,"onMouseup")),r.length&&(l=jt(s.helper(Pm),[l,JSON.stringify(r)])),o.length&&(!Ss(i)||Bm(i.content.toLowerCase()))&&(l=jt(s.helper(Mm),[l,JSON.stringify(o)])),c.length){const d=c.map(An).join("");i=Ss(i)?Ve(`${i.content}${d}`,!0):Ys(["(",i,`) + "${d}"`])}return{props:[Ft(i,l)]}}),w_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(62,n)),{props:[],needRuntime:s.helper(Fm)}},k_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},S_=[p_],T_={cloak:c_,html:h_,text:m_,model:v_,on:__,show:w_};function C_(e,t={}){return r_(e,Je({},u_,t,{nodeTransforms:[k_,...S_,...t.nodeTransforms||[]],directiveTransforms:Je({},T_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Gu=Object.create(null);function E_(e,t){if(!He(e))if(e.nodeType)e=e.innerHTML;else return Xt;const s=jv(e,t),a=Gu[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Je({hoistStatic:!0,onError:void 0,onWarn:Xt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=C_(e,n),l=new Function("Vue",i)(Dx);return l._rc=!0,Gu[s]=l}kh(E_);const Io=an({items:[]});let A_=1;function nr(e,t="info",s=3e3){const a=A_++;return Io.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>wd(a),s),a}function wd(e){const t=Io.items.findIndex(s=>s.id===e);t>=0&&Io.items.splice(t,1)}function we(e,t="info",s=3e3){return nr(e,t,s)}we.success=(e,t=3e3)=>nr(e,"success",t);we.error=(e,t=5e3)=>nr(e,"error",t);we.info=(e,t=3e3)=>nr(e,"info",t);we.dismiss=wd;const R_={setup(){return{state:Io,dismiss:wd}},template:`
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
  `},Ta=an({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ii=null;function Kt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return ii&&ii(!1),Ta.title=e,Ta.message=t,Ta.confirmLabel=s,Ta.cancelLabel=a,Ta.danger=n,Ta.open=!0,new Promise(i=>{ii=i})}function Ku(e){Ta.open=!1,ii&&(ii(e),ii=null)}const I_={setup(){function e(t){Ta.open&&t.key==="Escape"&&(t.stopPropagation(),Ku(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:Ta,settle:Ku}},template:`
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
 */const Gn=typeof document<"u";function Hm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function O_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Hm(e.default)}const ut=Object.assign;function Tr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Xs(n)?n.map(e):e(n)}return s}const Ki=()=>{},Xs=Array.isArray;function Wu(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const zm=/#/g,L_=/&/g,N_=/\//g,D_=/=/g,P_=/\?/g,jm=/\+/g,M_=/%5B/g,F_=/%5D/g,Vm=/%5E/g,$_=/%60/g,qm=/%7B/g,U_=/%7C/g,Gm=/%7D/g,B_=/%20/g;function kd(e){return e==null?"":encodeURI(""+e).replace(U_,"|").replace(M_,"[").replace(F_,"]")}function H_(e){return kd(e).replace(qm,"{").replace(Gm,"}").replace(Vm,"^")}function pc(e){return kd(e).replace(jm,"%2B").replace(B_,"+").replace(zm,"%23").replace(L_,"%26").replace($_,"`").replace(qm,"{").replace(Gm,"}").replace(Vm,"^")}function z_(e){return pc(e).replace(D_,"%3D")}function j_(e){return kd(e).replace(zm,"%23").replace(P_,"%3F")}function V_(e){return j_(e).replace(N_,"%2F")}function fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const q_=/\/$/,G_=e=>e.replace(q_,"");function Cr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=Z_(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:fl(l)}}function K_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Ju(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function W_(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&vi(t.matched[a],s.matched[n])&&Km(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function vi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Km(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!J_(e[s],t[s]))return!1;return!0}function J_(e,t){return Xs(e)?Zu(e,t):Xs(t)?Zu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Zu(e,t){return Xs(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function Z_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const Ga={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let fc=(function(e){return e.pop="pop",e.push="push",e})({}),Er=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Y_(e){if(!e)if(Gn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),G_(e)}const Q_=/^[^#]+#/;function X_(e,t){return e.replace(Q_,"#")+t}function ew(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const ir=()=>({left:window.scrollX,top:window.scrollY});function tw(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=ew(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Yu(e,t){return(history.state?history.state.position-t:-1)+e}const hc=new Map;function sw(e,t){hc.set(e,t)}function aw(e){const t=hc.get(e);return hc.delete(e),t}function nw(e){return typeof e=="string"||e&&typeof e=="object"}function Wm(e){return typeof e=="string"||typeof e=="symbol"}let Et=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Jm=Symbol("");Et.MATCHER_NOT_FOUND+"",Et.NAVIGATION_GUARD_REDIRECT+"",Et.NAVIGATION_ABORTED+"",Et.NAVIGATION_CANCELLED+"",Et.NAVIGATION_DUPLICATED+"";function gi(e,t){return ut(new Error,{type:e,[Jm]:!0},t)}function xa(e,t){return e instanceof Error&&Jm in e&&(t==null||!!(e.type&t))}const iw=["params","query","hash"];function lw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of iw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function ow(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(jm," "),i=n.indexOf("="),l=fl(i<0?n:n.slice(0,i)),o=i<0?null:fl(n.slice(i+1));if(l in t){let r=t[l];Xs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Qu(e){let t="";for(let s in e){const a=e[s];if(s=z_(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Xs(a)?a.map(n=>n&&pc(n)):[a&&pc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function rw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Xs(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const cw=Symbol(""),Xu=Symbol(""),lr=Symbol(""),Sd=Symbol(""),mc=Symbol("");function Ri(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Qa(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(gi(Et.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):nw(p)?r(gi(Et.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Ar(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Hm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Qa(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=O_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Qa(p,s,a,l,o,n)()}))}}return i}function dw(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>vi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>vi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let uw=()=>location.protocol+"//"+location.host;function Zm(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),Ju(o,"")}return Ju(s,e)+a+n}function pw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=Zm(e,location),m=s.value,v=t.value;let k=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}k=v?p.position-v.position:0}else a(h);n.forEach(A=>{A(s.value,m,{delta:k,type:fc.pop,direction:k?k>0?Er.forward:Er.back:Er.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ut({},p.state,{scroll:ir()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function ep(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?ir():null}}function fw(e){const{history:t,location:s}=window,a={value:Zm(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:uw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ut({},t.state,ep(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ut({},n.value,t.state,{forward:r,scroll:ir()});i(d.current,d,!0),i(r,ut({},ep(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function hw(e){e=Y_(e);const t=fw(e),s=pw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ut({location:"",base:e,go:a,createHref:X_.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function mw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),hw(e)}let vn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ht=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ht||{});const vw={type:vn.Static,value:""},gw=/[a-zA-Z0-9_]/;function bw(e){if(!e)return[[]];if(e==="/")return[[vw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Ht.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ht.Static?i.push({type:vn.Static,value:c}):s===Ht.Param||s===Ht.ParamRegExp||s===Ht.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:vn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ht.ParamRegExp){a=s,s=Ht.EscapeNext;continue}switch(s){case Ht.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ht.Param):p();break;case Ht.EscapeNext:p(),s=a;break;case Ht.Param:r==="("?s=Ht.ParamRegExp:gw.test(r)?p():(u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ht.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ht.ParamRegExpEnd:d+=r;break;case Ht.ParamRegExpEnd:u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ht.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const tp="[^/]+?",yw={sensitive:!1,strict:!1,start:!0,end:!0};var ds=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ds||{});const xw=/[.+*?^${}()[\]/\\]/g;function _w(e,t){const s=ut({},yw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ds.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=ds.Segment+(s.sensitive?ds.BonusCaseSensitive:0);if(p.type===vn.Static)u||(n+="/"),n+=p.value.replace(xw,"\\$&"),h+=ds.Static;else if(p.type===vn.Param){const{value:m,repeatable:v,optional:k,regexp:A}=p;i.push({name:m,repeatable:v,optional:k});const y=A||tp;if(y!==tp){h+=ds.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=k&&c.length<2?`(?:/${g})`:"/"+g),k&&(g+="?"),n+=g,h+=ds.Dynamic,k&&(h+=ds.BonusOptional),v&&(h+=ds.BonusRepeatable),y===".*"&&(h+=ds.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=ds.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===vn.Static)d+=h.value;else if(h.type===vn.Param){const{value:m,repeatable:v,optional:k}=h,A=m in c?c[m]:"";if(Xs(A)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Xs(A)?A.join("/"):A;if(!y)if(k)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function ww(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===ds.Static+ds.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ds.Static+ds.Segment?1:-1:0}function Ym(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=ww(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(sp(a))return 1;if(sp(n))return-1}return n.length-a.length}function sp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const kw={strict:!1,end:!0,sensitive:!1};function Sw(e,t,s){const a=_w(bw(e.path),s),n=ut(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function Tw(e,t){const s=[],a=new Map;t=Wu(kw,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,v=np(u);v.aliasOf=h&&h.record;const k=Wu(t,u),A=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const _ of b)A.push(np(ut({},v,{components:h?h.record.components:v.components,path:_,aliasOf:h?h.record:v})))}let y,g;for(const b of A){const{path:_}=b;if(p&&_[0]!=="/"){const w=p.record.path,C=w[w.length-1]==="/"?"":"/";b.path=p.record.path+(_&&C+_)}if(y=Sw(b,p,k),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!ip(y)&&l(u.name)),Qm(y)&&r(y),v.children){const w=v.children;for(let C=0;C<w.length;C++)i(w[C],y,h&&h.children[C])}h=h||y}return g?()=>{l(g)}:Ki}function l(u){if(Wm(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Aw(u,s);s.splice(p,0,u),u.record.name&&!ip(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},v,k;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u});k=h.record.name,m=ut(ap(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&ap(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),k=h.record.name);else{if(h=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u,currentLocation:p});k=h.record.name,m=ut({},p.params,u.params),v=h.stringify(m)}const A=[];let y=h;for(;y;)A.unshift(y.record),y=y.parent;return{name:k,path:v,params:m,matched:A,meta:Ew(A)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function ap(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function np(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Cw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Cw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function ip(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Ew(e){return e.reduce((t,s)=>ut(t,s.meta),{})}function Aw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;Ym(e,t[i])<0?a=i:s=i+1}const n=Rw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Rw(e){let t=e;for(;t=t.parent;)if(Qm(t)&&Ym(e,t)===0)return t}function Qm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function lp(e){const t=Hs(lr),s=Hs(Sd),a=z(()=>{const r=da(e.to);return t.resolve(r)}),n=z(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(vi.bind(null,d));if(p>-1)return p;const h=op(r[c-2]);return c>1&&op(d)===h&&u[u.length-1].path!==h?u.findIndex(vi.bind(null,r[c-2])):p}),i=z(()=>n.value>-1&&Dw(s.params,a.value.params)),l=z(()=>n.value>-1&&n.value===s.matched.length-1&&Km(s.params,a.value.params));function o(r={}){if(Nw(r)){const c=t[da(e.replace)?"replace":"push"](da(e.to)).catch(Ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:z(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Iw(e){return e.length===1?e[0]:e}const Ow=_l({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:lp,setup(e,{slots:t}){const s=an(lp(e)),{options:a}=Hs(lr),n=z(()=>({[rp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[rp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Iw(t.default(s));return e.custom?i:ci("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Lw=Ow;function Nw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Dw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Xs(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function op(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const rp=(e,t,s)=>e??t??s,Pw=_l({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Hs(mc),n=z(()=>e.route||a.value),i=Hs(Xu,0),l=z(()=>{let c=da(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=z(()=>n.value.matched[l.value]);zi(Xu,z(()=>l.value+1)),zi(cw,o),zi(mc,n);const r=f();return Ut(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!vi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return cp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,k=ci(p,ut({},m,t,{onVnodeUnmounted:A=>{A.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return cp(s.default,{Component:k,route:c})||k}}});function cp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Mw=Pw;function Fw(e){const t=Tw(e.routes,e),s=e.parseQuery||ow,a=e.stringifyQuery||Qu,n=e.history,i=Ri(),l=Ri(),o=Ri(),r=Dc(Ga);let c=Ga;Gn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Tr.bind(null,q=>""+q),u=Tr.bind(null,V_),p=Tr.bind(null,fl);function h(q,ce){let pe,me;return Wm(q)?(pe=t.getRecordMatcher(q),me=ce):me=q,t.addRoute(me,pe)}function m(q){const ce=t.getRecordMatcher(q);ce&&t.removeRoute(ce)}function v(){return t.getRoutes().map(q=>q.record)}function k(q){return!!t.getRecordMatcher(q)}function A(q,ce){if(ce=ut({},ce||r.value),typeof q=="string"){const F=Cr(s,q,ce.path),I=t.resolve({path:F.path},ce),Z=n.createHref(F.fullPath);return ut(F,I,{params:p(I.params),hash:fl(F.hash),redirectedFrom:void 0,href:Z})}let pe;if(q.path!=null)pe=ut({},q,{path:Cr(s,q.path,ce.path).path});else{const F=ut({},q.params);for(const I in F)F[I]==null&&delete F[I];pe=ut({},q,{params:u(F)}),ce.params=u(ce.params)}const me=t.resolve(pe,ce),_e=q.hash||"";me.params=d(p(me.params));const Me=K_(a,ut({},q,{hash:H_(_e),path:me.path})),T=n.createHref(Me);return ut({fullPath:Me,hash:_e,query:a===Qu?rw(q.query):q.query||{}},me,{redirectedFrom:void 0,href:T})}function y(q){return typeof q=="string"?Cr(s,q,r.value.path):ut({},q)}function g(q,ce){if(c!==q)return gi(Et.NAVIGATION_CANCELLED,{from:ce,to:q})}function b(q){return C(q)}function _(q){return b(ut(y(q),{replace:!0}))}function w(q,ce){const pe=q.matched[q.matched.length-1];if(pe&&pe.redirect){const{redirect:me}=pe;let _e=typeof me=="function"?me(q,ce):me;return typeof _e=="string"&&(_e=_e.includes("?")||_e.includes("#")?_e=y(_e):{path:_e},_e.params={}),ut({query:q.query,hash:q.hash,params:_e.path!=null?{}:q.params},_e)}}function C(q,ce){const pe=c=A(q),me=r.value,_e=q.state,Me=q.force,T=q.replace===!0,F=w(pe,me);if(F)return C(ut(y(F),{state:typeof F=="object"?ut({},_e,F.state):_e,force:Me,replace:T}),ce||pe);const I=pe;I.redirectedFrom=ce;let Z;return!Me&&W_(a,me,pe)&&(Z=gi(Et.NAVIGATION_DUPLICATED,{to:I,from:me}),U(me,me,!0,!1)),(Z?Promise.resolve(Z):O(I,me)).catch(Y=>xa(Y)?xa(Y,Et.NAVIGATION_GUARD_REDIRECT)?Y:le(Y):N(Y,I,me)).then(Y=>{if(Y){if(xa(Y,Et.NAVIGATION_GUARD_REDIRECT))return C(ut({replace:T},y(Y.to),{state:typeof Y.to=="object"?ut({},_e,Y.to.state):_e,force:Me}),ce||I)}else Y=E(I,me,!0,T,_e);return $(I,me,Y),Y})}function S(q,ce){const pe=g(q,ce);return pe?Promise.reject(pe):Promise.resolve()}function x(q){const ce=W.values().next().value;return ce&&typeof ce.runWithContext=="function"?ce.runWithContext(q):q()}function O(q,ce){let pe;const[me,_e,Me]=dw(q,ce);pe=Ar(me.reverse(),"beforeRouteLeave",q,ce);for(const F of me)F.leaveGuards.forEach(I=>{pe.push(Qa(I,q,ce))});const T=S.bind(null,q,ce);return pe.push(T),de(pe).then(()=>{pe=[];for(const F of i.list())pe.push(Qa(F,q,ce));return pe.push(T),de(pe)}).then(()=>{pe=Ar(_e,"beforeRouteUpdate",q,ce);for(const F of _e)F.updateGuards.forEach(I=>{pe.push(Qa(I,q,ce))});return pe.push(T),de(pe)}).then(()=>{pe=[];for(const F of Me)if(F.beforeEnter)if(Xs(F.beforeEnter))for(const I of F.beforeEnter)pe.push(Qa(I,q,ce));else pe.push(Qa(F.beforeEnter,q,ce));return pe.push(T),de(pe)}).then(()=>(q.matched.forEach(F=>F.enterCallbacks={}),pe=Ar(Me,"beforeRouteEnter",q,ce,x),pe.push(T),de(pe))).then(()=>{pe=[];for(const F of l.list())pe.push(Qa(F,q,ce));return pe.push(T),de(pe)}).catch(F=>xa(F,Et.NAVIGATION_CANCELLED)?F:Promise.reject(F))}function $(q,ce,pe){o.list().forEach(me=>x(()=>me(q,ce,pe)))}function E(q,ce,pe,me,_e){const Me=g(q,ce);if(Me)return Me;const T=ce===Ga,F=Gn?history.state:{};pe&&(me||T?n.replace(q.fullPath,ut({scroll:T&&F&&F.scroll},_e)):n.push(q.fullPath,_e)),r.value=q,U(q,ce,pe,T),le()}let M;function V(){M||(M=n.listen((q,ce,pe)=>{if(!ue.listening)return;const me=A(q),_e=w(me,ue.currentRoute.value);if(_e){C(ut(_e,{replace:!0,force:!0}),me).catch(Ki);return}c=me;const Me=r.value;Gn&&sw(Yu(Me.fullPath,pe.delta),ir()),O(me,Me).catch(T=>xa(T,Et.NAVIGATION_ABORTED|Et.NAVIGATION_CANCELLED)?T:xa(T,Et.NAVIGATION_GUARD_REDIRECT)?(C(ut(y(T.to),{force:!0}),me).then(F=>{xa(F,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&!pe.delta&&pe.type===fc.pop&&n.go(-1,!1)}).catch(Ki),Promise.reject()):(pe.delta&&n.go(-pe.delta,!1),N(T,me,Me))).then(T=>{T=T||E(me,Me,!1),T&&(pe.delta&&!xa(T,Et.NAVIGATION_CANCELLED)?n.go(-pe.delta,!1):pe.type===fc.pop&&xa(T,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),$(me,Me,T)}).catch(Ki)}))}let G=Ri(),P=Ri(),L;function N(q,ce,pe){le(q);const me=P.list();return me.length?me.forEach(_e=>_e(q,ce,pe)):console.error(q),Promise.reject(q)}function ne(){return L&&r.value!==Ga?Promise.resolve():new Promise((q,ce)=>{G.add([q,ce])})}function le(q){return L||(L=!q,V(),G.list().forEach(([ce,pe])=>q?pe(q):ce()),G.reset()),q}function U(q,ce,pe,me){const{scrollBehavior:_e}=e;if(!Gn||!_e)return Promise.resolve();const Me=!pe&&aw(Yu(q.fullPath,0))||(me||!pe)&&history.state&&history.state.scroll||null;return Ot().then(()=>_e(q,ce,Me)).then(T=>T&&tw(T)).catch(T=>N(T,q,ce))}const K=q=>n.go(q);let oe;const W=new Set,ue={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:v,resolve:A,options:e,push:b,replace:_,go:K,back:()=>K(-1),forward:()=>K(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:P.add,isReady:ne,install(q){q.component("RouterLink",Lw),q.component("RouterView",Mw),q.config.globalProperties.$router=ue,Object.defineProperty(q.config.globalProperties,"$route",{enumerable:!0,get:()=>da(r)}),Gn&&!oe&&r.value===Ga&&(oe=!0,b(n.location).catch(me=>{}));const ce={};for(const me in Ga)Object.defineProperty(ce,me,{get:()=>r.value[me],enumerable:!0});q.provide(lr,ue),q.provide(Sd,Nc(ce)),q.provide(mc,r);const pe=q.unmount;W.add(q),q.unmount=function(){W.delete(q),W.size<1&&(c=Ga,M&&M(),M=null,r.value=Ga,oe=!1,L=!1),pe()}}};function de(q){return q.reduce((ce,pe)=>ce.then(()=>x(pe)),Promise.resolve())}return ue}function Xm(){return Hs(lr)}function $w(e){return Hs(Sd)}const or={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=$w(),s=Xm(),a=z({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=z(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=z(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Ut(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),fa=e=>Number.isSafeInteger(e)&&e>=0,Uw=e=>e===null||typeof e=="string",Oo=(e,t)=>fa(e)&&fa(t)&&t>=e,Td=e=>hl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Uw(e.cursor);function Bw(e){return!Td(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!fa(e.total_chars)||!fa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Oo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&Oo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function dp(e){return Td(e)&&e.kind==="process_output"&&fa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>fa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Oo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Hw(e){return Td(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>fa(e[t]))&&Oo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&fa(e.tools_omitted)}function vc(e){try{return JSON.parse(e)}catch{return}}const gc=e=>JSON.stringify(e,null,2),zw=e=>{const t=vc(e);return t===void 0?e:gc(t)},Hl=(e,t,s)=>`[${e}, ${t}) ${s}`;function ev(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:gc(e)??"";let a=typeof e=="string"?vc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=vc(e.slice(d+c.length)),h=e.slice(0,u);dp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?zw(d):d});if(hl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||fa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...fa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],hl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(Bw(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Hl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Hl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(dp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Hl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(Hw(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Hl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?gc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function tv(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Rr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),jw=e=>e!==null&&typeof e=="object",Vw=new Set(["_hmac","_prev_hmac"]),bc=e=>e.replace(/\r\n?/g,`
`);function ml(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(Vw.has(n)){s=!0;return}return i});return bc(s?JSON.stringify(a):t)}catch{return bc(t)}}function qw(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&jw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Gw(e){var h;const t=ev(typeof e=="string"?bc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:ml(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Rr.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=tv(c,Rr.previewLines,Rr.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:qw(t)}}const Kw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=z(()=>Gw(e.value)),c=z(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=z(()=>a.value?c.value:r.value.formatted),u=z(()=>r.value.promoted&&r.value.preview.folded||o.value),p=z(()=>t.value?!!d.value:r.value.promoted),h=z(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function k(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function A(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Ut([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,_)=>{(e.recordId===null||b[2]!==_[2])&&(t.value=!1,a.value=!1),n.value=""}),Ut([i,l,t,s,r],()=>Ot(k),{flush:"post"}),Ge(()=>{m=new ResizeObserver(v),k()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:A,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},rr={name:"ToolOutput",components:{CompactOutput:Kw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=z(()=>ev(e.value)),l=z(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=z(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=tv(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=z(()=>o.value.some(u=>u.folded)),c=z(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Ut(()=>e.value,()=>{t.value=!1,n.value=""}),Ut(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},Ww={components:{ToolOutput:rr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var v,k,A,y,g,b,_,w,C,S,x;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(k=h.metadata)!=null&&k.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const O=h.call_id||((A=h.metadata)==null?void 0:A.call_id)||null,$=h.agent_id||((y=h.metadata)==null?void 0:y.agent_id)||"",E={callId:O,agentId:$,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:O?`${$}:${O}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(E);return}if(m==="tool_end"||m==="loop_tool"){const O=h.call_id||((_=h.metadata)==null?void 0:_.call_id)||null,$=h.agent_id||((w=h.metadata)==null?void 0:w.agent_id)||"";let E=-1;if(O&&(E=e.value.findIndex(M=>M.callId===O&&M.agentId===$&&M.status==="running")),E<0&&!O)for(let M=e.value.length-1;M>=0;M--){const V=e.value[M];if(V.tool===h.action&&V.agentId===$&&V.status==="running"){E=M;break}}if(E>=0){const M=e.value[E];M.status=h.error||(C=h.metadata)!=null&&C.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((S=h.metadata)==null?void 0:S.status))?"error":"success",M.elapsed=h.execution_time_ms??h.duration_ms??((x=h.metadata)==null?void 0:x.elapsed_ms)??Date.now()-M.startTime,M.result=h.result_summary??h.detail??"",M.fadingOut=!0,setTimeout(()=>{const V=e.value.indexOf(M);V>=0&&e.value.splice(V,1),t.value.unshift(M),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const O=h.call_id||h.tool_name||"unknown";if(h.finished){const $={...s.value};delete $[O],s.value=$}else{const E=((s.value[O]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[O]:E.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,st.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,st.off("events",n),i&&(clearInterval(i),i=null))}Ge(r),es(r),Wt(c),ft(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Cd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function In(e){const t=Cd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Jw(e){const t=Cd(e);return t?t.toLocaleTimeString():"—"}function sv(e){const t=Cd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Zw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function bi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Ed(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function av(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function up(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ad(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function nv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const iv=Symbol("agent-detail-cancelled"),Yw=15e3;function Qw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,iv),i==null||i.abort()}}}function lv({state:e,requestDetail:t,timeoutMs:s=Yw,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const k=Qw(A=>t(p,{signal:A}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return v.cancel=k.cancel,v.promise=(async()=>{let A=null,y=null;try{A=await k.promise}catch(g){y=g}A!==iv&&(l!==v||e.detailId!==p||(l=null,!y&&(A===null||typeof A!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=A,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Xw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const ek={components:{ToolOutput:rr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=z(()=>e.value.filter(N=>N.status==="running").length),r=z(()=>e.value.filter(N=>N.status==="completed").length),c=z(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=z(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=z(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function p(N){const ne=Number(N.max_iterations)||0;return ne<=0?0:Math.min(100,Math.round(N.iteration_count/ne*100))}function h(N){return(Number(N.max_iterations)||0)>0}function m(N,ne){return N?N==="N/A"?"N/A":ne==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function v(N){return m(N.display_model,N.display_model_source||N.display_source)}function k(N){return m(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function A(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const y=f(null),g=f(null),b=f(!1),_=f(null),w=f(""),S=lv({state:{get detail(){return y.value},set detail(N){y.value=N},get detailId(){return g.value},set detailId(N){g.value=N},get detailLoading(){return b.value},set detailLoading(N){b.value=N},get detailError(){return _.value},set detailError(N){_.value=N}},requestDetail:(N,{signal:ne})=>B.get(`/api/agents/${encodeURIComponent(N)}`,{signal:ne})});async function x(N){w.value="",await S.open(N.id)}function O(){S.close(),w.value=""}async function $(){await S.refresh()}async function E(N,ne){try{await navigator.clipboard.writeText(ne||""),w.value=N,setTimeout(()=>{w.value===N&&(w.value="")},1500)}catch{we.error("Copy failed")}}async function M(N=!1){N=N===!0,N||(t.value=!0);try{const ne=await B.get("/api/agents");e.value=Array.isArray(ne)?ne:[],s.value=null}catch(ne){N||(s.value=ne.message)}N||(t.value=!1)}async function V(N){const ne=e.value.find(U=>U.id===N);if(await Kt({title:"Kill agent",message:`Kill agent "${(ne==null?void 0:ne.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=N;try{await B.del(`/api/agents/${encodeURIComponent(N)}`),we.success("Agent killed"),await M()}catch(U){we.error(U.message||"Failed to kill agent")}a.value=null}}const G=Xw({isEnabled:()=>n.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:$});function P(){G.start()}function L(){G.stop()}return Ut(n,()=>G.sync()),Ge(()=>{l=!0,M(),P()}),es(()=>{l=!0,M(!0),P()}),Wt(()=>{l=!1,L()}),ft(()=>{l=!1,L(),S.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:In,formatDuration:bi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:k,displaySourceLabel:A,detail:y,detailId:g,detailLoading:b,detailError:_,copied:w,openDetail:x,closeDetail:O,copyText:E,fetchAgents:M,killAgent:V,startAutoRefresh:P,stopAutoRefresh:L}}},tk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const k=lv({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:N})=>B.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:N})});async function A(L){h.value="",await k.open(L.id)}function y(){k.close(),h.value=""}async function g(L,N){try{await navigator.clipboard.writeText(N||""),h.value=L,setTimeout(()=>{h.value===L&&(h.value="")},1500)}catch{we.error("Copy failed")}}const b=z(()=>e.value.reduce((L,N)=>L+(N.iteration_count||0),0)),_=z(()=>e.value.filter(L=>L.status==="running").length);function w(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function C(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function S(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function x(L=!1){L=L===!0,L||(t.value=!0);try{const N=await B.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){L||(s.value=N.message)}L||(t.value=!1)}async function O(){l.value=null;const L=n.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(N.stop_condition=L.stop_condition.trim()),i.value=!0;try{const ne=await B.post("/api/loops",N);we.success(`Loop started: ${ne.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await x()}catch(ne){l.value=ne.message}i.value=!1}async function $(L){if(await Kt({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await B.del(`/api/loops/${encodeURIComponent(L)}`),we.success("Loop stopped"),await x()}catch(ne){we.error(ne.message||"Failed to stop loop")}o.value=null}}async function E(L){r.value=L;try{await B.post(`/api/loops/${encodeURIComponent(L)}/restart`),we.success("Loop restarted"),await x()}catch(N){we.error(N.message||"Failed to restart loop")}r.value=null}function M(L){m&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(x(!0),d.value&&k.refresh())}let V=null;function G(){V!==null&&clearInterval(V),V=null}function P(){G(),m&&(V=setInterval(()=>{x(!0),d.value&&k.refresh()},5e3))}return Ge(()=>{m=!0,x(),st.subscribe("events",M),P()}),es(()=>{m=!0,x(!0),P()}),Wt(()=>{m=!1,G()}),ft(()=>{m=!1,st.unsubscribe("events",M),G(),k.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:_,statusDotClass:w,statusBadge:C,modeBadge:S,formatAge:sv,formatDuration:bi,formatTs:In,formatTokens:nv,openDetail:A,closeDetail:y,copyText:g,fetchLoops:x,doCreate:O,doStop:$,doRestart:E}}},sk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=z(()=>e.value.filter(y=>y.status==="running").length),o=z(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await B.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Ut(a,y=>{y?u():p()});async function h(y){if(await Kt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await B.del(`/api/processes/${y}`),we.success(`Process ${y} killed`),await d()}catch(b){we.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function k(){v||(v=!0,d(),st.subscribe("events",m),u())}function A(){v&&(v=!1,st.unsubscribe("events",m),p())}return Ge(k),es(k),Wt(A),ft(A),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:bi,fetchProcesses:d,doKill:h}}},ak=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function pp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function nk(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function ik(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function lk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=ak.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const k of new Set([p,h])){const A=new Date(u+k*6e4);nk(A,c)===d&&(m.some(y=>y.getTime()===A.getTime())||m.push(A))}if(m.sort((k,A)=>k.getTime()-A.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(k=>({instant:k,offset:ik(k),iso:k.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const ok=5e3;function to(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function zl(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function fp(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:to(e.data.connection)}const rk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Schedules</h1>
          <p class="page-lede">Create, inspect, and run recurring or one-time automation.</p>
        </div>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs"
                  :disabled="!schedulingAvailable">
            {{ showCreate ? 'Cancel' : 'New Schedule' }}
          </button>
          <button @click="fetchSchedules" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="!schedulingAvailable" class="hm-card border-yellow-900 mb-4 text-xs text-yellow-300" role="status">
        {{ schedulingAvailabilityMessage }} Creation, immediate runs, and resume are disabled. Existing schedules and history remain available.
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

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating || !schedulingAvailable">
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
                          :disabled="togglingId === s.id || (s.paused && !schedulingAvailable)"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s.id)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id || !schedulingAvailable"
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(to(null)),n=z(()=>a.value.available),i=z(()=>zl(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),c=f(!1),d=f(null),u=f(null),p=z(()=>lk(r.value.run_at));Ut(()=>r.value.run_at,()=>{u.value=null});const h=z(()=>{var Z;const I=p.value;return I.state==="ok"?I.instant:I.state==="ambiguous"&&u.value!==null&&((Z=I.options[u.value])==null?void 0:Z.instant)||null}),m=z(()=>{const I=h.value;return I?`${I.toLocaleString()} local — ${I.toISOString()} UTC`:""}),v=f(null),k=f(!1),A=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],y=f(null),g=f(null),b=f(null),_=f(null),w=f(null),C=f(null),S=f([]),x=f(!1),O=f("");let $=0;const E=z(()=>e.value.filter(I=>I.cron&&!I.one_time).length),M=z(()=>e.value.filter(I=>I.one_time).length),V=z(()=>e.value.filter(I=>I.trigger).length),G=z(()=>e.value.filter(I=>I.paused).length),P=z(()=>e.value.filter(I=>I.consecutive_failures>0).length);function L(I){if(!I)return"-";const Z=Date.now(),ae=(new Date(I).getTime()-Z)/1e3;if(ae<0)return"overdue";if(ae<60)return"in < 1 min";if(ae<3600)return`in ${Math.floor(ae/60)} min`;if(ae<86400){const H=Math.floor(ae/3600),ee=Math.floor(ae%3600/60);return ee>0?`in ${H}h ${ee}m`:`in ${H}h`}const ve=Math.floor(ae/86400);return`in ${ve} day${ve!==1?"s":""}`}function N(I){return I==null?"-":I<1e3?`${I}ms`:I<6e4?`${(I/1e3).toFixed(1)}s`:bi(I/1e3)}function ne(I=r.value.cron){r.value.cron=I,pp(r.value,"cron"),v.value=null}function le(I=r.value.run_at){r.value.run_at=I,pp(r.value,"run_at"),v.value=null}async function U(){const I=r.value.cron.trim();if(I){k.value=!0;try{v.value=await B.post("/api/schedules/validate-cron",{expression:I})}catch(Z){v.value={valid:!1,error:Z.message}}k.value=!1}}async function K(){t.value=!0,s.value=null;try{e.value=await B.get("/api/schedules")}catch(I){s.value=I.message}t.value=!1}async function oe(){try{a.value=to(await B.get("/api/schedules/status"))}catch(I){a.value=fp(I)||to(null)}}function W(I){const Z=fp(I);Z&&(a.value=Z)}async function ue(I){if(C.value===I){C.value=null,S.value=[];return}C.value=I,x.value=!0,S.value=[];const Z=++$;try{const Y=await B.get(`/api/schedules/${encodeURIComponent(I)}/history?limit=10`);if(Z!==$||C.value!==I)return;S.value=Y,O.value=""}catch(Y){if(Z!==$||C.value!==I)return;S.value=[],O.value=Y.message||"Failed to load execution history"}Z===$&&(x.value=!1)}async function de(){if(d.value=null,!n.value){d.value=zl(a.value);return}const I=r.value;if(!I.description.trim()){d.value="Description is required";return}if(!I.channel_id.trim()){d.value="Channel ID is required";return}if(!I.cron.trim()&&!I.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(I.cron.trim()&&I.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Z={description:I.description.trim(),action:I.action,channel_id:I.channel_id.trim()};if(I.cron.trim()&&(Z.cron=I.cron.trim()),I.run_at.trim()){const Y=p.value;if(Y.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(Y.state==="invalid"){d.value="One-time run time is not a valid date";return}const ae=h.value;if(Y.state==="ambiguous"&&u.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!ae){d.value="One-time run time could not be resolved";return}Z.run_at=ae.toISOString()}if(I.action==="reminder"&&I.message.trim()&&(Z.message=I.message.trim()),I.action==="check"&&(I.tool_name.trim()&&(Z.tool_name=I.tool_name.trim()),I.report_format&&(Z.report_format=I.report_format),I.tool_input_str.trim()))try{Z.tool_input=JSON.parse(I.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}c.value=!0;try{await B.post("/api/schedules",Z),we.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},v.value=null,o.value=!1,await K()}catch(Y){W(Y),d.value=Y.message}c.value=!1}async function q(I){if(!n.value){we.error(zl(a.value));return}y.value=I;try{const Z=await B.post(`/api/schedules/${encodeURIComponent(I)}/run`);if(Z.status==="failure")we.error(`Execution failed: ${Z.error||"unknown error"}`);else{const Y=Z.warning?`Executed (${Z.warning})`:"Executed successfully";we.success(Y)}await K()}catch(Z){W(Z),we.error(Z.message||"Failed to trigger")}y.value=null}async function ce(I){if(I.paused&&!n.value){we.error(zl(a.value));return}b.value=I.id;const Z=!I.paused;try{await B.put(`/api/schedules/${encodeURIComponent(I.id)}`,{paused:Z}),we.success(Z?"Schedule paused":"Schedule resumed"),await K()}catch(Y){W(Y),we.error(Y.message||"Failed to update schedule")}b.value=null}const pe=new Map;function me(I,Z){const Y=pe.get(I.id);Y&&clearTimeout(Y.timer);const ae={run:()=>_e(I,Z),timer:null};ae.timer=setTimeout(()=>{pe.delete(I.id),ae.run()},500),pe.set(I.id,ae)}async function _e(I,Z){w.value=I.id;try{await B.put(`/api/schedules/${encodeURIComponent(I.id)}`,{report_format:Z}),we.success(Z?"Structured report enabled":"Plain-text report enabled")}catch(Y){we.error(`Update failed: ${Y.message}`)}finally{await K(),w.value=null}}function Me(){for(const[I,Z]of[...pe])clearTimeout(Z.timer),pe.delete(I),Z.run()}async function T(I){_.value=I;try{await B.post(`/api/schedules/${encodeURIComponent(I)}/reset-failures`),we.success("Failure counters reset"),await K()}catch(Z){we.error(Z.message||"Failed to reset")}_.value=null}async function F(I){const Z=e.value.find(ae=>ae.id===I);if(await Kt({title:"Delete schedule",message:`Delete "${(Z==null?void 0:Z.description)||I}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){g.value=I;try{await B.del(`/api/schedules/${encodeURIComponent(I)}`),we.success("Schedule deleted"),await K()}catch(ae){we.error(ae.message||"Failed to delete schedule")}g.value=null}}return Ge(()=>{K(),oe(),l=setInterval(oe,ok)}),ft(()=>{Me(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:m,runAtAnalysis:p,runAtOccurrence:u,cronResult:v,validatingCron:k,cronPresets:A,runningId:y,deletingId:g,togglingId:b,resettingId:_,reportUpdatingId:w,flushReportFormatTimers:Me,expandedId:C,history:S,historyLoading:x,historyError:O,cronCount:E,oneTimeCount:M,webhookCount:V,pausedCount:G,failingCount:P,formatTs:In,formatAge:sv,formatFuture:L,formatMs:N,formatDuration:bi,onCronInput:ne,onRunAtInput:le,validateCron:U,toggleExpand:ue,fetchSchedules:K,fetchSchedulingAvailability:oe,doCreate:de,doRunNow:q,doTogglePause:ce,doUpdateReportFormat:me,doResetFailures:T,doDelete:F}}},ov=[{id:"live",label:"Live",component:Ww},{id:"agents",label:"Agents",component:ek},{id:"loops",label:"Loops",component:tk},{id:"processes",label:"Processes",component:sk},{id:"schedules",label:"Schedules",component:rk}],ck={components:{TabbedPage:or},setup(){return{tabs:ov}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},dk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await B.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const v=new URLSearchParams;n.value.tool&&v.set("tool",n.value.tool),n.value.user&&v.set("user",n.value.user),n.value.keyword&&v.set("q",n.value.keyword),n.value.date&&v.set("date",n.value.date),v.set("limit",String(n.value.limit));const k=v.toString(),A=await B.get(`/api/audit${k?"?"+k:""}`);if(m!==r)return;e.value=Array.isArray(A)?A:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:In,formatDetail:i,truncateBlock:av,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},hp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],uk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],pk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=hp,k=uk,A=f([]),y=f(!1),g=f(""),b=f("flat"),_=f(new Set),w=f(""),C=f(""),S=f(""),x=f(null),O=f(!1),$=f(""),E=f(!1);let M=0;Ut([w,C,S],()=>{M++,O.value=!1,$.value="",E.value=x.value!==null},{flush:"sync"});function V(){try{const te=localStorage.getItem("odin-session-presets");te&&(A.value=JSON.parse(te))}catch{}}function G(){try{localStorage.setItem("odin-session-presets",JSON.stringify(A.value))}catch{}}const P=z(()=>p.value.trim()!==""||u.value!=="all"),L=z(()=>{let te=[...e.value];const Ce=hp.find(We=>We.id===u.value),Ne=Ce?Ce.filters:{};if(Ne.source&&(te=te.filter(We=>We.source===Ne.source)),Ne.minMessages&&(te=te.filter(We=>We.message_count>=Ne.minMessages)),Ne.hasCompaction&&(te=te.filter(We=>We.has_summary)),Ne.maxAge!=null){const We=Date.now()/1e3;te=te.filter(Dt=>Dt.last_active&&We-Dt.last_active<=Ne.maxAge)}if(p.value.trim()){const We=p.value.toLowerCase().trim();te=te.filter(Dt=>(Dt.channel_id||"").toLowerCase().includes(We)||(Dt.last_user_id||"").toLowerCase().includes(We)||(Dt.source||"").toLowerCase().includes(We))}const Qe=h.value,Nt=m.value?1:-1;return te.sort((We,Dt)=>{const Vt=We[Qe]||0,ms=Dt[Qe]||0;return(Vt-ms)*Nt}),te}),N=z(()=>{if(!n.value||!n.value.messages)return[];const te=n.value.messages;if(te.length===0)return[];const Ce=[];let Ne=[];for(const Qe of te)Qe.role==="user"&&Ne.length>0&&(Ce.push(Ne),Ne=[]),Ne.push(Qe);return Ne.length>0&&Ce.push(Ne),Ce}),ne=z(()=>L.value.length>0&&c.value.size===L.value.length);function le(te){const Ce=te.find(Ne=>Ne.role==="user");if(Ce&&Ce.content){const Ne=Ce.content.slice(0,120);return Ne.length<Ce.content.length?Ne+"...":Ne}return"(no user message)"}function U(te){const Ce=new Set(_.value);Ce.has(te)?Ce.delete(te):Ce.add(te),_.value=Ce}function K(te){u.value=te}function oe(te){u.value=te.id,te.filters.searchQuery!=null&&(p.value=te.filters.searchQuery),te.filters.sortBy&&(h.value=te.filters.sortBy)}function W(){if(!g.value.trim())return;const te={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};A.value=[...A.value,te],G(),y.value=!1,g.value=""}function ue(te){A.value=A.value.filter(Ce=>Ce.id!==te),G(),u.value===te&&(u.value="all")}function de(){u.value="all",p.value="",h.value="last_active",m.value=!1}function q(te){if(!te)return"—";const Ce=Date.now()/1e3-te;if(Ce<60)return"just now";if(Ce<3600){const Qe=Math.floor(Ce/60);return`${Qe} minute${Qe!==1?"s":""} ago`}if(Ce<86400){const Qe=Math.floor(Ce/3600);return`${Qe} hour${Qe!==1?"s":""} ago`}const Ne=Math.floor(Ce/86400);return`${Ne} day${Ne!==1?"s":""} ago`}function ce(te){if(!te)return"";try{return new Date(te*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function pe(te){if(!te)return"";try{return new Date(te*1e3).toLocaleString()}catch{return""}}function me(te){return te==="user"?"bg-gray-900/50 border border-gray-800":te==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function _e(te){return te==="user"?"sess-msg-user":te==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Me(te){return te==="user"?"badge-info":te==="assistant"?"badge-success":"badge-warning"}function T(te){return te==="user"?"sess-dot-user":te==="assistant"?"sess-dot-assistant":"sess-dot-system"}function F(te){return te==="user"?"text-cyan-400":te==="assistant"?"text-indigo-400":"text-gray-500"}function I(te){return te?te.length>2e3?te.slice(0,2e3)+`
... (truncated)`:te:""}async function Z(){const te=w.value.trim();if(!te)return;const Ce=++M;O.value=!0,$.value="",E.value=x.value!==null;try{let Ne=`/api/sessions/search?q=${encodeURIComponent(te)}&limit=50`;C.value.trim()&&(Ne+=`&channel_id=${encodeURIComponent(C.value.trim())}`),S.value.trim()&&(Ne+=`&user_id=${encodeURIComponent(S.value.trim())}`);const Qe=await B.get(Ne);if(Ce!==M)return;x.value=Qe.results||[],E.value=!1}catch(Ne){if(Ce!==M)return;$.value=Ne.message||"Search failed. Please retry."}finally{Ce===M&&(O.value=!1)}}function Y(){M++,w.value="",C.value="",S.value="",x.value=null,$.value="",E.value=!1,O.value=!1}function ae(te){return te?te.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ve(te){return te==="user"?"fts-result-user":te==="assistant"?"fts-result-assistant":te==="summary"?"fts-result-summary":te==="fts"?"fts-result-fts":te==="channel"?"fts-result-channel":"fts-result-default"}function H(te){return te==="user"?"badge-info":te==="assistant"?"badge-success":te==="summary"?"badge-warning":te==="fts"?"badge-success":"badge-info"}let ee=0;async function X(){const te=++ee;t.value=!0,s.value=null;try{const Ce=await B.get("/api/sessions");if(te!==ee)return;e.value=Ce}catch(Ce){if(te!==ee)return;s.value=Ce.message}te===ee&&(t.value=!1)}function he(){s.value=null,X()}async function fe(te){if(a.value===te){a.value=null,n.value=null,_.value=new Set;return}a.value=te,n.value=null,i.value=!0,_.value=new Set;const Ce=++l;try{const Ne=await B.get(`/api/sessions/${encodeURIComponent(te)}`);Ce===l&&a.value===te&&(n.value=Ne)}catch(Ne){Ce===l&&a.value===te&&(n.value={messages:[],summary:"",error:Ne.message||"Failed to load session"})}finally{Ce===l&&(i.value=!1)}}function ye(te){const Ce=new Set(c.value);Ce.has(te)?Ce.delete(te):Ce.add(te),c.value=Ce}function Oe(){ne.value?c.value=new Set:c.value=new Set(L.value.map(te=>te.channel_id))}function ge(te){o.value=te}async function Fe(){if(o.value){r.value=!0;try{await B.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(te){s.value=te.message||"Failed to clear session"}r.value=!1,o.value=null}}function $e(){d.value=!0}async function ze(){if(c.value.size!==0){r.value=!0;try{await B.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(te){s.value=te.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ye(te,Ce){const Ne=`/api/sessions/${encodeURIComponent(te)}/export?format=${Ce}`;try{const Qe=await B.getBlob(Ne),Nt=URL.createObjectURL(Qe),We=document.createElement("a");We.href=Nt,We.download=`session-${te}.${Ce==="text"?"txt":"json"}`,We.click(),URL.revokeObjectURL(Nt)}catch(Qe){s.value=Qe.message||"Failed to export session"}}let at=null;function nt(te){te.payload&&te.payload.channel_id&&(clearTimeout(at),at=setTimeout(()=>{if(X(),a.value&&te.payload.channel_id===a.value){const Ce=a.value,Ne=l;B.get(`/api/sessions/${encodeURIComponent(Ce)}`).then(Qe=>{Ne!==l||a.value!==Ce||(n.value=Qe)}).catch(()=>{})}},2e3))}let Q=!1,xe=null;function Ee(){Q||(Q=!0,X(),st.subscribe("events",nt),xe=st.onReconnected(()=>X()))}Ge(()=>{V(),Ee()}),es(()=>{Ee()});function Le(){Q&&(Q=!1,st.unsubscribe("events",nt),xe&&(xe(),xe=null),clearTimeout(at))}return Wt(Le),ft(Le),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:ne,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:k,filteredSessions:L,hasActiveFilters:P,customPresets:A,showSavePreset:y,newPresetName:g,threadView:b,threads:N,collapsedThreads:_,ftsQuery:w,ftsChannelId:C,ftsUserId:S,ftsResults:x,ftsSearching:O,ftsError:$,ftsStale:E,formatAge:q,formatTimestamp:ce,formatFullTimestamp:pe,messageClass:me,threadMsgClass:_e,roleBadge:Me,roleDotClass:T,roleLabelClass:F,truncateContent:I,threadSummary:le,fetchSessions:X,retry:he,toggleSession:fe,toggleSelect:ye,toggleSelectAll:Oe,confirmClear:ge,clearSession:Fe,confirmBulkClear:$e,doBulkClear:ze,exportSession:Ye,applyPreset:K,applyCustomPreset:oe,saveCustomPreset:W,removeCustomPreset:ue,resetFilters:de,toggleThread:U,runFtsSearch:Z,clearFtsSearch:Y,highlightSnippet:ae,ftsResultClass:ve,ftsTypeBadge:H}}},fk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:nv}}},hk={components:{ContextAssemblyPanel:fk},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(C){if(!C)return"—";try{const S=new Date(C);return isNaN(S.getTime())?C:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return C}}function p(C){return!C&&C!==0?"—":C<1e3?C+"ms":(C/1e3).toFixed(1)+"s"}function h(C){return!C&&C!==0?"—":C>=1e3?(C/1e3).toFixed(1)+"k":String(C)}function m(C){if(!C)return"";if(typeof C=="string")return C;try{return JSON.stringify(C,null,2)}catch{return String(C)}}function v(C){n.value===C?n.value=null:(n.value=C,c.value={})}function k(C,S){const x=C+"-"+S;c.value={...c.value,[x]:!c.value[x]}}function A(C,S){return!!c.value[C+"-"+S]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,_()}async function g(){try{const C=await B.get("/api/trajectories");e.value=C.files||[],r.value=C.count||0}catch{}}let b=0;async function _(){const C=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const S=await B.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(C!==b)return;let x=S.entries||[];d.value.tool_name&&(x=x.filter(O=>(O.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(O=>O.is_error)),d.value.channel_id&&(x=x.filter(O=>O.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(O=>O.user_id===d.value.user_id)),t.value=x}else{const S=new URLSearchParams;d.value.channel_id&&S.set("channel_id",d.value.channel_id),d.value.user_id&&S.set("user_id",d.value.user_id),d.value.tool_name&&S.set("tool_name",d.value.tool_name),d.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(d.value.limit));const x=S.toString(),O=await B.get(`/api/trajectories/search/query?${x}`);if(C!==b)return;t.value=O.results||[]}}catch(S){if(C!==b)return;a.value=S.message}C===b&&(s.value=!1)}async function w(){if(!l.value.trim())return;const C=++b;s.value=!0,a.value=null,c.value={};try{const S=await B.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(C!==b)return;i.value=S.entry||null,i.value||(a.value="No trace found for this message ID")}catch(S){if(C!==b)return;S.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=S.message}C===b&&(s.value=!1)}return Ge(async()=>{await g(),await _()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:av,toggleExpand:v,toggleIteration:k,isIterationExpanded:A,clearFilters:y,fetchFiles:g,fetchTraces:_,lookupMessage:w}}};function mk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function vk(e){return e?`${e.approximate?"~":""}${Ad(e.total||0)}`:"0"}const gk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=z(()=>a.value.work||{}),h=z(()=>Math.max(1,...(a.value.activity_over_time||[]).map(w=>Number(w.count||0)))),m=z(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),v=w=>({height:`${Math.max(4,Math.round(Number(w||0)/h.value*100))}%`}),k=z(()=>s.value&&l.value-i.value>3e4);async function A(){const w=++d,C=n.value;try{const S=await B.get(`/api/usage?range=${encodeURIComponent(C)}`);if(w!==d||C!==n.value)return;a.value=S,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(S){w===d&&(t.value=S.message)}finally{w===d&&(e.value=!1)}}function y(w){n.value=w,e.value=!s.value,A()}function g(){e.value=!0,A()}function b(){c||(c=!0,A(),o=setInterval(A,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function _(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),es(b),Wt(_),ft(_),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:k,fmtNum:Ad,fmtDuration:mk,tokenLabel:vk,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},rv=[{id:"audit",label:"Audit",component:dk},{id:"sessions",label:"Sessions",component:pk},{id:"traces",label:"Traces",component:hk},{id:"usage",label:"Usage & Activity",component:gk}],bk={components:{TabbedPage:or},setup(){return{tabs:rv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Ir=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,O){const $=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!$,r.value=$?!!x.global_enabled:null,!$){e.value=O.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const E=new Set($.map(V=>V.name)),M=O.filter(V=>!E.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...$.map(V=>({...V,source:"builtin"})),...M]}async function m(x,O){if(d.value.has(x.name))return;const $=!!O.target.checked,E=new Set(d.value);E.add(x.name),d.value=E;try{const M=await B.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:$});h(M,e.value),s.value=null;try{const V=await B.get("/api/tools");h(M,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch(M){O.target.checked=!!x.enabled,s.value=M.message||`Failed to toggle ${x.name}`}finally{const M=new Set(d.value);M.delete(x.name),d.value=M}}const v=z(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),k=z(()=>e.value.filter(x=>x.source==="skill").length),A=z(()=>Object.values(n.value).reduce((x,O)=>x+O,0));function y(x){for(const O of Ir)if(O.id!=="other"&&O.match(x))return O.id;return"other"}const g=z(()=>{let x=e.value;if(a.value){const O=a.value.toLowerCase();x=x.filter($=>$.name.toLowerCase().includes(O)||($.description||"").toLowerCase().includes(O))}return o.value&&(x=x.filter(O=>y(O.name)===o.value)),x}),b=z(()=>{const x=new Set;for(const O of e.value)x.add(y(O.name));return Ir.filter(O=>x.has(O.id))}),_=z(()=>{const x=g.value,O={};for(const E of x){const M=y(E.name);O[M]||(O[M]=[]),O[M].push(E)}const $=[];for(const E of Ir)O[E.id]&&O[E.id].length>0&&$.push({label:E.label,icon:E.icon,tools:O[E.id].sort((M,V)=>M.name.localeCompare(V.name))});return $});function w(x){i.value={...i.value,[x]:!i.value[x]}}async function C(){t.value=!0,s.value=null;try{const[x,O,$]=await Promise.all([B.get("/api/tools"),B.get("/api/tools/stats").catch(()=>({})),B.get("/api/tools/builtins").catch(()=>null)]);h($,x),n.value=O||{}}catch(x){s.value=x.message}t.value=!1}function S(){C()}return Ge(()=>{C()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:k,totalUsage:A,filteredTools:g,groupedTools:_,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Ed,toggleExpand:w,refresh:S}}};function xk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _k(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const wk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),k=f(null),A=f(!1),y=z(()=>e.value.length),g=z(()=>e.value.reduce((W,ue)=>W+(ue.execution_count||0),0)),b=z(()=>e.value.reduce((W,ue)=>W+O(ue.code),0)),_=z(()=>{if(!l.value)return e.value;const W=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(W)||(ue.description||"").toLowerCase().includes(W))}),w=z(()=>u.value?u.value.split(`
`).length:0),C=z(()=>{const W=Math.max(w.value,1);return Array.from({length:W},(ue,de)=>de+1).join(`
`)}),S=z(()=>{const W=u.value.trim();return W?W.includes("SKILL_DEFINITION")?W.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(W){return xk(W)}function O(W){return W?W.split(`
`).length:0}function $(W){return _k(W)}function E(W){a.value={...a.value,[W]:!a.value[W]}}async function M(W){try{await navigator.clipboard.writeText(W);const ue=e.value.find(de=>de.code===W);ue&&(o.value=ue.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function V(W){if(W.key==="Tab"){W.preventDefault();const ue=W.target,de=ue.selectionStart,q=ue.selectionEnd;u.value=u.value.substring(0,de)+"    "+u.value.substring(q),Ot(()=>{ue.selectionStart=ue.selectionEnd=de+4})}}function G(W){const ue=W.target.previousElementSibling;ue&&(ue.scrollTop=W.target.scrollTop)}async function P(){t.value=!0,s.value=null;try{e.value=await B.get("/api/skills")}catch(W){s.value=W.message}t.value=!1}async function L(W){i.value=W,delete n.value[W],n.value={...n.value};try{const ue=await B.post(`/api/skills/${encodeURIComponent(W)}/test`);n.value={...n.value,[W]:ue}}catch(ue){n.value={...n.value,[W]:{result:ue.message,is_error:!0}}}i.value=null}function N(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function ne(W){r.value=!0,c.value="edit",d.value=W.name,u.value=W.code||"",p.value=null,h.value=null}function le(){r.value=!1,p.value=null,h.value=null}async function U(){p.value=null,h.value=null;const W=d.value.trim(),ue=u.value.trim();if(!W){p.value="Name is required";return}if(!ue){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await B.post("/api/skills",{name:W,code:ue}),h.value="Skill created successfully"):(await B.put(`/api/skills/${encodeURIComponent(W)}`,{code:ue}),h.value="Skill updated successfully"),await P(),setTimeout(()=>{r.value=!1},800)}catch(de){p.value=de.message}m.value=!1}function K(W){k.value=W}async function oe(){if(k.value){A.value=!0;try{await B.del(`/api/skills/${encodeURIComponent(k.value)}`),await P()}catch(W){we.error(`Failed to delete skill: ${W.message||"unknown error"}`)}A.value=!1,k.value=null}}return Ge(()=>{P()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:k,deleting:A,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:_,editLineCount:w,editorLineNums:C,editValidation:S,highlight:x,truncate:Ed,formatTs:In,countLines:O,getLineNumbers:$,toggleCode:E,copyCode:M,handleEditorKey:V,syncScroll:G,fetchSkills:P,testSkill:L,showCreate:N,editSkill:ne,cancelEdit:le,saveSkill:U,confirmDelete:K,doDelete:oe}}};class $s extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const kk=/^[A-Za-z_][A-Za-z0-9_]*$/;function mp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function vp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new $s(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new $s(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new $s(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new $s(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function Sk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Tk(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new $s("Server name is required.","name");if(n.length>128||!kk.test(n))throw new $s("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new $s("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=mp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new $s("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new $s("An HTTP endpoint is required for this connection.","url");if(d&&!Sk(d))throw new $s("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new $s("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=mp(e.allowlistText));const r=vp(e.headerRows,e.headersRemove,"Header"),c=vp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Ck(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Ek(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Ak(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Rk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Ik(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Ok=1e4,Lk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Or(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Nk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Dk={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=z(()=>Object.keys(i.value).every(Q=>{var xe;return Number.isInteger((xe=e.value)==null?void 0:xe[Q])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),v=f(!1),k=f("add"),A=f(""),y=f(null),g=f(Or()),b=f(""),_=f(!1);let w=null,C=0,S=!1,x=!1;const O=Rk,$=z(()=>{var Q;return((Q=e.value)==null?void 0:Q.servers)||[]}),E=z(()=>{var Q;return!!((Q=e.value)!=null&&Q.enabled)}),M=z(()=>{var Q,xe,Ee,Le;return{serverCount:((Q=e.value)==null?void 0:Q.server_count)||0,enabledCount:((xe=e.value)==null?void 0:xe.enabled_server_count)||0,connectedCount:((Ee=e.value)==null?void 0:Ee.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),V=z(()=>{var Q;return((Q=y.value)==null?void 0:Q.header_keys)||[]}),G=z(()=>{var Q;return((Q=y.value)==null?void 0:Q.env_keys)||[]}),P=z(()=>{var Q;return k.value==="edit"&&((Q=y.value)==null?void 0:Q.transport)==="http"}),L=z(()=>k.value==="add"||!P.value),N=z(()=>P.value?"Replace endpoint URL":"Endpoint URL"),ne=z(()=>P.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function le(){U(),w=window.setInterval(()=>K({quiet:!0}),Ok)}function U(){w&&window.clearInterval(w),w=null}async function K({quiet:Q=!1}={}){if(a.value)return;const xe=++C;Q||(t.value=!0);try{const Ee=await B.get("/api/mcp/status");if(xe!==C||!S)return;e.value=Ee;for(const te of Object.keys(i.value))!l.value.has(te)&&Number.isInteger(Ee[te])&&(i.value[te]=String(Ee[te]));r.value="";const Le=new Set((Ee.servers||[]).map(te=>te.name));d.value=new Set([...d.value].filter(te=>Le.has(te)))}catch(Ee){xe===C&&S&&(r.value=Ee.message||"Failed to load MCP status")}finally{xe===C&&(t.value=!1)}}function oe(Q){return s.value||c.value.has(Q)}function W(Q,xe){const Ee=new Set(c.value);xe?Ee.add(Q):Ee.delete(Q),c.value=Ee}function ue(Q){return Ek(Q.state)}function de(Q){if(ue(Q)==="disabled"){if(!Q.enabled)return"Disabled — server switch off";if(!E.value)return"Disabled — global MCP is off"}return Lk[ue(Q)]}function q(Q){return Q.transport==="http"?"Streamable HTTP":"stdio"}function ce(Q){return Q.negotiated_version?`${Q.era?`${String(Q.era).charAt(0).toUpperCase()}${String(Q.era).slice(1)}`:"Protocol"} · ${Q.negotiated_version}`:"Not negotiated"}function pe(Q){return Q.discovered_count?`${Q.published_count||0} published · ${Q.excluded_count||0} excluded`:"No tools discovered"}const me=f(new Set);async function _e(Q,xe){if(me.value.has(Q.name))return;const Ee=!!xe.target.checked,Le=new Set(me.value);Le.add(Q.name),me.value=Le;try{const te=await B.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/enabled`,{enabled:Ee});te&&Array.isArray(te.servers)?e.value=te:await K({quiet:!0})}catch(te){xe.target.checked=!!Q.enabled,we.error(te.message||`Failed to toggle ${Q.name}`)}finally{const te=new Set(me.value);te.delete(Q.name),me.value=te}}function Me(Q,xe){var Le;i.value[Q]=xe;const Ee=new Set(l.value);xe===String((Le=e.value)==null?void 0:Le[Q])?Ee.delete(Q):Ee.add(Q),l.value=Ee,n.value=""}async function T(){if(s.value||!o.value||!l.value.size)return;const Q={};for(const xe of l.value){const Ee=Number(i.value[xe]),Le=xe==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ee)||Ee<1||Ee>Le){n.value=`Enter a whole number between 1 and ${Le}.`;return}Q[xe]=Ee}a.value=!0,s.value=!0,n.value="",++C,t.value=!1;try{const xe=await B.post("/api/mcp/limits",Q);e.value=xe;for(const Ee of Object.keys(i.value))Number.isInteger(xe[Ee])&&(i.value[Ee]=String(xe[Ee]));l.value=new Set,we.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(xe){n.value=xe.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await K({quiet:!0})}}async function F(Q){if(Q!==E.value&&!(!Q&&!await Kt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await B.post("/api/mcp/enabled",{enabled:Q}),we.success(Q?"MCP enabled":"MCP disabled"),await K({quiet:!0})}catch(xe){we.error(xe.message||"Failed to update MCP state"),await K({quiet:!0})}finally{s.value=!1}}}async function I(Q){W(Q.name,!0);try{await B.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/reconnect`,{}),we.success(`Reconnected ${Q.name}`)}catch(xe){we.error(xe.message||`Failed to reconnect ${Q.name}`)}finally{W(Q.name,!1),await K({quiet:!0})}}async function Z(Q){W(Q.name,!0);try{await B.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/refresh-tools`,{}),we.success(`Refreshed tools from ${Q.name}`),await ve(Q.name,!0)}catch(xe){we.error(xe.message||`Failed to refresh ${Q.name}`)}finally{W(Q.name,!1),await K({quiet:!0})}}async function Y(Q){if(await Kt({title:`Remove ${Q.name}`,message:`Remove this saved MCP server? Its ${Q.published_count||0} published tool${Q.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){W(Q.name,!0);try{await B.del(`/api/mcp/servers/${encodeURIComponent(Q.name)}`),we.success(`Removed ${Q.name}`),delete p.value[Q.name]}catch(Ee){we.error(Ee.message||`Failed to remove ${Q.name}`)}finally{W(Q.name,!1),await K({quiet:!0})}}}async function ae(Q){const xe=new Set(d.value);if(xe.has(Q.name)){xe.delete(Q.name),d.value=xe;return}xe.add(Q.name),d.value=xe,Object.hasOwn(p.value,Q.name)||await ve(Q.name)}async function ve(Q,xe=!1){if(!xe&&Object.hasOwn(p.value,Q))return;const Ee=new Set(m.value);Ee.add(Q),m.value=Ee,h.value={...h.value,[Q]:""};try{const Le=await B.get(`/api/mcp/servers/${encodeURIComponent(Q)}/tools`);p.value={...p.value,[Q]:Le.tools||[]}}catch(Le){h.value={...h.value,[Q]:Le.message||"Failed to load tools"}}finally{const Le=new Set(m.value);Le.delete(Q),m.value=Le}}function H(Q){return(p.value[Q]||[]).filter(xe=>Ak(xe,u.value[Q]))}function ee(Q,xe){u.value={...u.value,[Q]:xe}}function X(){k.value="add",A.value="",y.value=null,g.value=Or(),b.value="",v.value=!0}function he(Q){k.value="edit",A.value=Q.name,y.value=Q,g.value={...Or(),name:Q.name,enabled:!!Q.enabled,transport:Q.transport||"stdio"},b.value="",v.value=!0}function fe(){_.value||(v.value=!1)}function ye(Q){v.value&&Ik(Q)}function Oe(Q){const xe=Q==="headers"?"headerRows":"envRows";g.value[xe].push({key:"",value:""})}function ge(Q,xe){const Ee=Q==="headers"?"headerRows":"envRows";g.value[Ee].splice(xe,1)}function Fe(Q,xe){const Ee=Q==="headers"?"headersRemove":"envRemove",Le=g.value[Ee];g.value[Ee]=Le.includes(xe)?Le.filter(te=>te!==xe):[...Le,xe]}async function $e(){var xe,Ee;b.value="";let Q;try{Q=Tk(g.value,{mode:k.value,originalTransport:((xe=y.value)==null?void 0:xe.transport)||""})}catch(Le){b.value=Le instanceof $s?Le.message:"Invalid MCP server configuration",await Ot(),(Ee=document.querySelector(".mcp-editor"))==null||Ee.scrollTo({top:0,behavior:"smooth"});return}if(!(k.value==="edit"&&Ck(Q,y.value)&&!await Kt({title:`Change ${A.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){_.value=!0;try{k.value==="add"?await B.post("/api/mcp/servers",Q):await B.put(`/api/mcp/servers/${encodeURIComponent(A.value)}`,Q),we.success(k.value==="add"?`Saved ${Q.name}`:`Updated ${A.value}`),v.value=!1,await K({quiet:!0})}catch(Le){b.value=Le.message||"Failed to save MCP server"}finally{_.value=!1}}}let ze=null;function Ye(Q){`${(Q==null?void 0:Q.event)||""} ${(Q==null?void 0:Q.type)||""} ${(Q==null?void 0:Q.tool)||""} ${(Q==null?void 0:Q.message)||""}`.toLowerCase().includes("mcp")&&(ze&&window.clearTimeout(ze),ze=window.setTimeout(()=>K({quiet:!0}),200))}function at(){S||(S=!0,x||(st.subscribe("events",Ye),x=!0),K(),le())}function nt(){S=!1,U(),ze&&window.clearTimeout(ze),ze=null,x&&(st.unsubscribe("events",Ye),x=!1)}return Ge(at),es(at),Wt(nt),ft(nt),{status:e,loading:t,mutating:s,pageError:r,servers:$,masterEnabled:E,aggregate:M,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Me,saveLimits:T,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:v,editorMode:k,editingName:A,editingServer:y,form:g,formError:b,saving:_,editorGroups:O,configuredHeaderKeys:V,configuredEnvKeys:G,savedHttpEndpoint:P,endpointRequired:L,endpointFieldLabel:N,endpointPlaceholder:ne,refreshAll:K,busy:oe,serverState:ue,stateLabel:de,transportLabel:q,protocolLabel:ce,toolSummary:pe,formatAge:Nk,setMasterEnabled:F,togglePending:me,toggleServerEnabled:_e,reconnect:I,refreshTools:Z,removeServer:Y,toggleTools:ae,filteredTools:H,setToolQuery:ee,openAdd:X,openEdit:he,closeEditor:fe,jumpToEditorGroup:ye,addSecretRow:Oe,removeSecretRow:ge,toggleSecretRemoval:Fe,saveServer:$e}}};function Pk(e,t){if(!e||!t)return up(e);const s=up(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Mk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let k=null;const A=f(null),y=f(!1),g=f({}),b=f({}),_=f({}),w=f({}),C=new Map,S=f(null),x=z(()=>e.value.reduce((U,K)=>U+(K.chunks||0),0)),O=z(()=>new Set(e.value.map(K=>K.uploader).filter(Boolean)).size);function $(U,K){const oe=b.value[K];if(!oe||oe.length===0)return 0;const W=Math.max(...oe.map(ue=>ue.char_count||0));return W===0?0:Math.round(U.char_count/W*100)}async function E(){t.value=!0,s.value=null;try{const U=await B.get("/api/knowledge");e.value=Array.isArray(U)?U:[]}catch(U){s.value=U.message}t.value=!1}async function M(U){if(g.value[U]){g.value[U]=!1,S.value=null;return}if(g.value[U]=!0,Object.prototype.hasOwnProperty.call(b.value,U))return;if(C.has(U))return C.get(U);const K={...w.value,[U]:!0};w.value=K;const oe={..._.value};delete oe[U],_.value=oe;const W=B.get(`/api/knowledge/${encodeURIComponent(U)}/chunks`).then(ue=>{b.value={...b.value,[U]:Array.isArray(ue)?ue:[]}}).catch(ue=>{_.value={..._.value,[U]:ue.message||"load failed"}}).finally(()=>{if(C.get(U)!==W)return;C.delete(U);const ue={...w.value};delete ue[U],w.value=ue});return C.set(U,W),W}let V=0;async function G(){const U=a.value.trim();if(!U)return;const K=++V;i.value=!0,o.value=null,l.value=U;try{const oe=await B.get(`/api/knowledge/search?q=${encodeURIComponent(U)}`);if(K!==V)return;n.value=Array.isArray(oe)?oe:[]}catch(oe){if(K!==V)return;n.value=[],o.value=oe.message||"Search failed"}K===V&&(i.value=!1)}function P(){V+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function L(){u.value=null,p.value=null;const U=c.value.trim(),K=d.value.trim();if(!U){u.value="Source name is required";return}if(!K){u.value="Content is required";return}h.value=!0;try{const oe=await B.post("/api/knowledge",{source:U,content:K});p.value=`Ingested ${oe.chunks||0} chunks from "${U}"`,c.value="",d.value="",b.value={},await E(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(oe){u.value=oe.message}h.value=!1}async function N(U){m.value=U,v.value=null,k&&(clearTimeout(k),k=null);try{const K=await B.post(`/api/knowledge/${encodeURIComponent(U)}/reingest`);v.value={source:U,error:!1,message:`Re-ingested ${K.chunks||0} chunks`},delete b.value[U],await E(),k=setTimeout(()=>{v.value=null,k=null},3e3)}catch(K){v.value={source:U,error:!0,message:K.message}}m.value=null}function ne(U){A.value=U}async function le(){if(A.value){y.value=!0;try{await B.del(`/api/knowledge/${encodeURIComponent(A.value)}`),delete b.value[A.value],await E()}catch(U){we.error(`Failed to delete source: ${U.message||"unknown error"}`)}y.value=!1,A.value=null}}return Ge(()=>{E()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:A,deleting:y,expanded:g,sourceChunks:b,chunkErrors:_,loadingChunks:w,selectedChunk:S,totalChunks:x,uploaderCount:O,truncate:Ed,formatTs:In,highlightTerms:Pk,chunkBarWidth:$,fetchSources:E,toggleSource:M,doSearch:G,clearSearch:P,doIngest:L,doReingest:N,confirmDelete:ne,doDelete:le}}},Fk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),k=f(null),A=f(new Set),y=f(null),g=f(!1),b=f(!1),_=z(()=>e.value.reduce((K,oe)=>K+oe.count,0)),w=z(()=>A.value.size);function C(K){const oe=t.value[K];if(!oe)return[];if(!l.value.trim())return oe;const W=l.value.trim().toLowerCase();return oe.filter(ue=>ue.key.toLowerCase().includes(W)||ue.value&&ue.value.toLowerCase().includes(W))}function S(K,oe){return A.value.has(K+"/"+oe)}function x(K,oe){const W=K+"/"+oe,ue=new Set(A.value);ue.has(W)?ue.delete(W):ue.add(W),A.value=ue}function O(K){const oe=t.value[K];return!oe||oe.length===0?!1:oe.every(W=>A.value.has(K+"/"+W.key))}function $(K,oe){const W=t.value[K];if(!W)return;const ue=new Set(A.value);for(const de of W){const q=K+"/"+de.key;oe?ue.add(q):ue.delete(q)}A.value=ue}async function E(){s.value=!0,a.value=null;try{const K=await B.get("/api/memory");e.value=Object.entries(K).map(([oe,W])=>({name:oe,keys:W.keys||[],count:W.count||0}))}catch(K){a.value=K.message}s.value=!1}async function M(K){if(n.value[K]){n.value[K]=!1;return}n.value[K]=!0;const oe=e.value.find(ue=>ue.name===K);if(!oe||t.value[K]||i.value===K)return;i.value=K;let W;try{const de=(await B.get(`/api/memory/${encodeURIComponent(K)}`)).entries||{};W=oe.keys.map(q=>Object.prototype.hasOwnProperty.call(de,q)?{key:q,value:de[q]||"",failed:!1}:{key:q,value:"",failed:!0,error:"Not found in scope"})}catch(ue){W=oe.keys.map(de=>({key:de,value:"",failed:!0,error:ue.message||"Failed to load"}))}t.value[K]=W,i.value=null}function V(K,oe,W){p.value=K+"/"+oe,h.value=W}async function G(K,oe){m.value=!0,v.value=null;try{await B.put(`/api/memory/${encodeURIComponent(K)}/${encodeURIComponent(oe)}`,{value:h.value});const W=t.value[K];if(W){const ue=W.find(de=>de.key===oe);ue&&(ue.value=h.value)}p.value=null}catch(W){v.value=`Failed to save: ${W.message||"unknown error"}`}m.value=!1}async function P(K,oe){try{await navigator.clipboard.writeText(oe.value),k.value=K+"/"+oe.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const K=r.value.scope.trim(),oe=r.value.key.trim(),W=r.value.value.trim();if(!K){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!W){d.value="Value is required";return}c.value=!0;try{await B.put(`/api/memory/${encodeURIComponent(K)}/${encodeURIComponent(oe)}`,{value:W}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await E(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ue){d.value=ue.message}c.value=!1}function N(K,oe){y.value={scope:K,key:oe}}async function ne(){if(!y.value)return;g.value=!0,v.value=null;const{scope:K,key:oe}=y.value;try{await B.del(`/api/memory/${encodeURIComponent(K)}/${encodeURIComponent(oe)}`);const W=t.value[K];W&&(t.value[K]=W.filter(q=>q.key!==oe));const ue=e.value.find(q=>q.name===K);ue&&(ue.count--,ue.keys=ue.keys.filter(q=>q!==oe));const de=new Set(A.value);de.delete(K+"/"+oe),A.value=de}catch(W){v.value=`Failed to delete: ${W.message||"unknown error"}`}g.value=!1,y.value=null}function le(){b.value=!0}async function U(){g.value=!0,v.value=null;const K=[];for(const oe of A.value){const W=oe.indexOf("/");K.push({scope:oe.slice(0,W),key:oe.slice(W+1)})}try{await B.post("/api/memory/bulk-delete",{entries:K}),A.value=new Set,t.value={},await E()}catch(oe){v.value=`Bulk delete failed: ${oe.message||"unknown error"}`}g.value=!1,b.value=!1}return Ge(()=>{E()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:k,selected:A,selectedCount:w,totalEntries:_,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:E,toggleScope:M,startEdit:V,doEdit:G,copyValue:P,doAdd:L,confirmDelete:N,doDelete:ne,confirmBulkDelete:le,doBulkDelete:U,isSelected:S,toggleSelect:x,isScopeAllSelected:O,toggleSelectAll:$,filteredEntries:C}}},$k={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=z(()=>[...new Set(e.value.map(k=>k.category))].sort()),r=z(()=>{const v={};return e.value.forEach(k=>{v[k.category]=(v[k.category]||0)+1}),v}),c=z(()=>n.value?e.value.filter(v=>v.category===n.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await B.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,we.success("Entry updated"),await m()}catch(k){we.error(k.message||"Failed to save entry")}}async function h(v){if(await Kt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/learned/"+encodeURIComponent(v)),we.success("Entry deleted"),await m()}catch(A){we.error(A.message||"Failed to delete entry")}}async function m(){s.value=!0,a.value=null;try{const v=await B.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){a.value=v.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:In,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},cv=[{id:"tools",label:"Tools",component:yk},{id:"skills",label:"Skills",component:wk},{id:"mcp-servers",label:"MCP Servers",component:Dk},{id:"knowledge",label:"Knowledge",component:Mk},{id:"memory",label:"Memory",component:Fk},{id:"learned",label:"Learned",component:$k}],Uk={components:{TabbedPage:or},setup(){return{tabs:cv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Bk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Hk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},zk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},jk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=z(()=>e.value.components||[]),l=z(()=>zk[e.value.overall]||"text-gray-400"),o=z(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=z(()=>{const w=e.value.overall;return w==="healthy"?"All Systems Healthy":w==="degraded"?"Some Systems Degraded":w==="unhealthy"?"System Issues Detected":"Unknown"});function c(w){return Bk[w]||"text-gray-400"}function d(w){return Hk[w]||"info"}function u(w){return w==="ok"?"badge-success":w==="degraded"?"badge-warning":w==="down"?"badge-danger":"badge-info"}function p(w){return w==="closed"?"text-green-400":w==="half_open"?"text-yellow-400":w==="open"?"text-red-400":"text-gray-400"}function h(w){return w.replace(/_/g," ").replace(/\b\w/g,C=>C.toUpperCase())}function m(w){if(!w)return"—";try{return new Date(w).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function v(w){return w>=1e6?(w/1e6).toFixed(1)+"M":w>=1e3?(w/1e3).toFixed(1)+"K":String(w)}async function k(){n.value=!0;try{e.value=await B.get("/api/health/components"),s.value=null,a.value=!0}catch(w){s.value=w.message}finally{t.value=!1,n.value=!1}}function A(){t.value=!0,s.value=null,k()}let y=null,g=!1;function b(){g||(g=!0,k(),y||(y=setInterval(k,3e4)))}function _(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ge(b),es(b),Wt(_),ft(_),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:k,retry:A}}},Vk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=z(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=z(()=>{if(!i.value)return[];const k=i.value,A=k.storage_total_bytes||1;return[{label:"Session Persistence",mb:k.sessions.persist_dir.total_mb,bytes:k.sessions.persist_dir.total_bytes,files:k.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(k.sessions.persist_dir.total_bytes/A*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:k.knowledge.db_file.total_mb,bytes:k.knowledge.db_file.total_bytes,files:k.knowledge.db_file.file_count,pct:Math.min(100,Math.round(k.knowledge.db_file.total_bytes/A*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:k.trajectories.message_dir.total_mb,bytes:k.trajectories.message_dir.total_bytes,files:k.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.message_dir.total_bytes/A*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:k.trajectories.agent_dir.total_mb,bytes:k.trajectories.agent_dir.total_bytes,files:k.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.agent_dir.total_bytes/A*100)),color:"res-bar-amber"}]});async function d(){try{const k=await B.get("/api/resource-usage");i.value=k,t.value=null,s.value=!0}catch(k){t.value=k.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),es(m),Wt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Ad,refresh:u,retry:p}}},qk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),Gk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Kk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!Gk.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?ml(t):""}function Wk(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!qk.has(c)));s=Object.keys(r).length?ml(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Xa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),vl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function Jk(e){const t=Xa(e)?e:{},s=Xa(t.metadata)?t.metadata:{},a=Xa(t.audit_metadata)?t.audit_metadata:{},n=Xa(t.turn)?t.turn:{},i=l=>vl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function gp(e){return e.record?JSON.stringify(dv(e),null,2):e.text}function dv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function yc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function bp(e){if(!yc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,vl(s.channel_id),vl(s.user_id??s.actor)])}function Zk(e,t,s=2e3){var i,l,o;const a=bp(t),n=a?e.findIndex(r=>bp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:yc(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(b=>Xa(b[y])).map(b=>b[y]);g.length&&(h[y]=Object.assign({},...g))}const m=c.some(y=>yc(y)!=="start"),v=c.find(y=>xc(y,0).level==="ERROR"),k=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);h.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(k)?k:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),v&&(h.error=v.error||((o=v.metadata)==null?void 0:o.error)||h.error);const A=xc(h,r.id,r._time);Object.assign(A,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,A)}e.length>s&&e.splice(0,e.length-s)}function xc(e,t,s=new Date){var u,p;let a=e;if(Xa(e)&&e.type==="log"&&"line"in e?a=e.line:Xa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Xa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":vl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:vl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:Jk(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function Yk(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const Qk={components:{ToolOutput:rr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=z(()=>Wk(e.entry)),s=z(()=>{var o;return ml(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=z(()=>{var o,r,c;return ml(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=z(()=>Kk(e.entry.record)),i=z(()=>dv(e.entry)),l=z(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},Xk=["INFO","WARNING","ERROR"],eS=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Lr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],tS=[50,100,200,500],sS={components:{ToolOutput:rr,LogRecord:Qk},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(st.state||"disconnected"),u=z(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,k=Xk,A=eS,y=Lr,g=f("all"),b=f(""),_=f([]),w=f(!1),C=f(""),S=f([]);function x(){try{const ie=localStorage.getItem("odin-log-presets");ie&&(_.value=JSON.parse(ie))}catch{}}function O(){try{localStorage.setItem("odin-log-presets",JSON.stringify(_.value))}catch{}}const $=z(()=>l.value!==""||o.value.trim()!==""||b.value!==""),E=z(()=>{const ie=Lr.find(Te=>Te.value===b.value);return ie?ie.label:""}),M=z(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ie){return ie.message}}),V=24,G=z(()=>{if(K.value.length===0)return[];const ie=[],Te=new Date,Ue=3600*1e3;for(let et=V-1;et>=0;et--){const kt=new Date(Te.getTime()-(et+1)*Ue),ht=new Date(Te.getTime()-et*Ue);ie.push({start:kt,end:ht,label:ne(kt,ht),shortLabel:ht.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const et of K.value){if(!et._time)continue;const kt=et._time.getTime();for(const ht of ie)if(kt>=ht.start.getTime()&&kt<ht.end.getTime()){ht.total++,et.level==="ERROR"?ht.errors++:et.level==="WARNING"?ht.warnings++:ht.info++;break}}return ie}),P=z(()=>{let ie=1;for(const Te of G.value)Te.total>ie&&(ie=Te.total);return ie}),L=z(()=>{if(G.value.length===0)return"";const ie=K.value.map(et=>et._time&&et._time.getTime()).filter(Boolean);if(ie.length===0)return"";const Te=new Date(Math.min(...ie));return`${K.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),N=z(()=>Math.ceil(V/8));function ne(ie,Te){const Ue={hour:"2-digit",minute:"2-digit"};return ie.toLocaleTimeString([],Ue)+" - "+Te.toLocaleTimeString([],Ue)}function le(ie,Te){return!Te||!ie?"0px":Math.max(2,ie/Te*100)+"%"}function U(ie){const Te=K.value.findIndex(Ue=>Ue._time&&Ue._time.getTime()>=ie.start.getTime()&&Ue._time.getTime()<ie.end.getTime());if(Te>=0&&p.value){const Ue=p.value.querySelector('[data-log-id="'+K.value[Te].id+'"]');Ue&&(Ue.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const K=z(()=>{let ie=t.value;if(l.value&&(ie=ie.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Lr.find(Ue=>Ue.value===b.value);if(Te&&Te.seconds){const Ue=new Date(Date.now()-Te.seconds*1e3);ie=ie.filter(et=>et._time&&et._time>=Ue)}}if(o.value&&!M.value)if(r.value)try{const Te=new RegExp(o.value,"i");ie=ie.filter(Ue=>{const et=Ue.searchText,kt=Ue.tool||"";return Te.test(et)||Te.test(kt)})}catch{}else{const Te=o.value.toLowerCase();ie=ie.filter(Ue=>{const et=Ue.searchText.toLowerCase(),kt=(Ue.tool||"").toLowerCase();return et.includes(Te)||kt.includes(Te)})}return ie}),oe=z(()=>Yk(K.value));function W(ie){const Te=xc(ie,++s);if(n.value){S.value.push(Te);return}ue(Te)}function ue(ie){Zk(t.value,ie,v),i.value&&Ot(()=>de())}function de(ie=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:ie?"smooth":"instant"})}function q(){i.value=!0,h.value=!1,Ot(()=>de(!0))}const ce=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function pe(){const ie=p.value;if(!ie)return;const Te=ie.scrollHeight-ie.scrollTop-ie.clientHeight<40;h.value=!i.value&&!Te&&t.value.length>0,T.value&&me()}function me(){const ie=p.value;!ie||!i.value||ie.scrollHeight-ie.scrollTop-ie.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function _e(){i.value&&requestAnimationFrame(me)}function Me(ie){ce.has(ie.key)&&_e()}const T=f(!1);function F(){i.value&&(T.value=!0,requestAnimationFrame(me))}function I(){T.value&&(T.value=!1,me())}function Z(){i.value&&(h.value=!1,Ot(()=>de()))}function Y(){if(n.value=!n.value,!n.value&&S.value.length>0){for(const ie of S.value)ue(ie);S.value=[]}}function ae(){t.value=[],S.value=[],h.value=!1}function ve(){let ie;e.value==="search"?ie=Ne.value.map(kt=>{const ht=kt.error?"ERROR":"INFO",ja=kt.tool_name?`[${kt.tool_name}] `:"";return`${kt.timestamp||""} ${ht} ${ja}${kt.result_summary||kt.message||""}`}).join(`
`):ie=K.value.map(gp).join(`

`);const Te=new Blob([ie],{type:"text/plain"}),Ue=URL.createObjectURL(Te),et=document.createElement("a");et.href=Ue,et.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,et.click(),URL.revokeObjectURL(Ue)}function H(ie){const Te=gp(ie);navigator.clipboard.writeText(Te).then(()=>{m.value=ie.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function ee(ie){l.value=l.value===ie?"":ie,g.value="all"}function X(ie){return ie.level==="ERROR"?"log-line-error":ie.level==="WARNING"?"log-line-warning":"text-gray-300"}function he(ie){return ie==="ERROR"?"text-red-500 font-semibold":ie==="WARNING"?"text-yellow-500":"text-blue-500"}function fe(ie){return ie==="ERROR"?"log-chip-error":ie==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(ie){g.value=ie.id;const Te=ie.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Oe(ie){g.value=ie.id,l.value=ie.filters.level||"",b.value=ie.filters.timeRange||"",o.value=ie.filters.text||""}function ge(){if(!C.value.trim())return;const ie={id:"custom-"+Date.now(),name:C.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};_.value=[..._.value,ie],O(),w.value=!1,C.value=""}function Fe(ie){_.value=_.value.filter(Te=>Te.id!==ie),O(),g.value===ie&&(g.value="all")}const $e=f("all"),ze=f(""),Ye=f(""),at=f(""),nt=f(""),Q=f(""),xe=f(100),Ee=tS,Le=f(!1),te=f(!1),Ce=f(""),Ne=f([]),Qe=f(null),Nt=f(null);function We(){e.value="search",Qe.value||Dt()}async function Dt(){try{Qe.value=await B.get("/api/logs/stats")}catch{}}function Vt(){const ie=Q.value;if(!ie){at.value="",nt.value="";return}const Ue={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ie];if(Ue){const et=new Date(Date.now()-Ue*1e3);at.value=ms(et),nt.value=""}}function ms(ie){const Te=Ue=>String(Ue).padStart(2,"0");return`${ie.getFullYear()}-${Te(ie.getMonth()+1)}-${Te(ie.getDate())}T${Te(ie.getHours())}:${Te(ie.getMinutes())}`}function ea(ie){if(!ie)return"";const Te=new Date(ie);return isNaN(Te.getTime())?"":Te.toISOString()}async function Cs(){Le.value=!0,Ce.value="",te.value=!0,Nt.value=null;try{const ie=new URLSearchParams;$e.value&&$e.value!=="all"&&ie.set("level",$e.value),ze.value&&ie.set("tool",ze.value),Ye.value&&ie.set("q",Ye.value);const Te=ea(at.value),Ue=ea(nt.value);Te&&ie.set("start",Te),Ue&&ie.set("end",Ue),ie.set("limit",String(xe.value));const et=await B.get(`/api/logs/search?${ie.toString()}`);Ne.value=et.entries||[]}catch(ie){Ce.value=ie.message||"Search failed",Ne.value=[]}finally{Le.value=!1}}function nn(){$e.value="all",ze.value="",Ye.value="",at.value="",nt.value="",Q.value="",xe.value=100,Ne.value=[],te.value=!1,Ce.value="",Nt.value=null}function ta(ie){Nt.value=Nt.value===ie?null:ie}function Vs(ie){if(!ie.timestamp)return"";try{return new Date(ie.timestamp).toLocaleString()}catch{return ie.timestamp}}function ha(ie){return ie.type==="web_action"?`${ie.status||""} (${ie.execution_time_ms||0}ms)`:(ie.result_summary||"").slice(0,200)}function vs(ie){return ie.error?"log-line-error":"text-gray-300"}function za(ie){try{return JSON.stringify(ie,null,2)}catch{return String(ie)}}let gs=null,it=!1;function Pt(){it||(it=!0,st.subscribe("logs",W),c.value=st.connected,d.value=st.state||"disconnected",gs=st.onState(ie=>{d.value=ie,c.value=ie==="connected"}))}function Ds(){it&&(it=!1,st.unsubscribe("logs",W),gs&&(gs(),gs=null))}return Ge(()=>{x(),window.addEventListener("pointerup",I),window.addEventListener("pointercancel",I)}),es(Pt),Wt(Ds),ft(()=>{Ds(),window.removeEventListener("pointerup",I),window.removeEventListener("pointercancel",I)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:oe,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:K,pauseBuffer:S,showJumpBottom:h,copiedIndex:m,regexError:M,levels:k,logPresets:A,timeRanges:y,timeRange:b,activeLogPreset:g,customLogPresets:_,showSaveLogPreset:w,newLogPresetName:C,hasActiveLogFilters:$,timeRangeLabel:E,timelineBuckets:G,timelineMax:P,timelineSpanLabel:L,timelineLabelSkip:N,togglePause:Y,clearLogs:ae,exportLogs:ve,logLineClass:X,levelClass:he,levelChipClass:fe,toggleLevel:ee,copyLine:H,jumpToBottom:q,onScroll:pe,onUserScrollIntent:_e,onUserScrollKey:Me,onAutoScrollToggle:Z,onPointerDown:F,applyLogPreset:ye,applyCustomLogPreset:Oe,saveLogCustomPreset:ge,removeLogCustomPreset:Fe,segmentHeight:le,jumpToTimelineBucket:U,searchLevel:$e,searchTool:ze,searchKeyword:Ye,searchStart:at,searchEnd:nt,searchTimePreset:Q,searchLimit:xe,searchLimits:Ee,searching:Le,searchRan:te,searchError:Ce,searchResults:Ne,searchStats:Qe,expandedSearch:Nt,switchToSearch:We,runSearch:Cs,clearSearchFilters:nn,toggleSearchExpand:ta,formatSearchTs:Vs,searchEntryText:ha,searchLogLineClass:vs,formatJson:za,applySearchTimePreset:Vt}}};function jl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const aS=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function nS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const li=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],iS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Vl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),lS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function yp(e){return lS.some(t=>e===t||e.startsWith(`${t}.`))}const uv="odin_config_center_expanded_v1",pv="odin_config_center_category_v1",oS=50,rS=650,Ii=()=>B.get("/api/config/meta");function pn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Zn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Hn(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function cS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function dS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function fv(e,t){if(Zn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return pn(t);const a={};for(const[n,i]of Object.entries(t)){const l=fv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function uS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=fv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function hv(e,t,s,a){if(Zn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)hv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function pS(){try{const e=JSON.parse(localStorage.getItem(uv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function fS(){try{const e=localStorage.getItem(pv);return li.some(t=>t.key===e)?e:li[0].key}catch{return li[0].key}}const hS={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=["image_model","outer_model"],o=f(null),r=f(null),c=f(null),d=f(!1),u=f(!1),p=f(null),h=f(""),m=f("all"),v=f(fS()),k=f(pS()),A=f({}),y=f({}),g=f(""),b=f({}),_=f({}),w=f([]),C=f([]),S=f(!1),x=f(!1),O=f(!1);let $=null,E=null,M={path:null,at:0},V=0;const G=z(()=>{var R;return(((R=t.value)==null?void 0:R.fields)||[]).filter(j=>!Vl.has(j.path.split(".")[0])&&!yp(j.path))}),P=z(()=>new Map(G.value.map(R=>[R.path,R]))),L=z(()=>K.value.reduce((R,j)=>R+j.sections.length,0)),N=z(()=>G.value.length),ne=z(()=>aS),le=z(()=>w.value.length>0),U=z(()=>C.value.length>0),K=z(()=>{if(!e.value)return[];const R=new Set(li.flatMap(Se=>Se.sections)),j=li.map(Se=>({...Se,sections:Se.sections.filter(Ke=>Object.hasOwn(e.value,Ke)&&!Vl.has(Ke))})).filter(Se=>Se.sections.length),se=Object.keys(e.value).filter(Se=>!R.has(Se)&&!Vl.has(Se));return se.length&&j.push({key:"other",label:"Other",icon:"folder",sections:se}),j}),oe=z(()=>e.value?{...e.value,...A.value}:null),W=z(()=>{if(!e.value)return[];const R=[];for(const[j,se]of Object.entries(A.value))hv(e.value[j],se,j,R);return R.filter(j=>!Zn(j.oldVal,j.newVal)).map(j=>{const se=Z(j.path);return{...j,label:(se==null?void 0:se.label)||Hn(j.path.split(".").at(-1)),apply_mode:(se==null?void 0:se.apply_mode)||he(j.path.split(".")[0])}})}),ue=z(()=>W.value.length>0),de=z(()=>W.value.length),q=z(()=>new Set(W.value.map(R=>R.path.split(".")[0])).size),ce=z(()=>!!h.value||m.value!=="all"),pe=z(()=>{const R={..._.value};for(const j of W.value){const se=Z(j.path),Se=Ln(se,j.newVal);Se&&(R[j.path]=Se)}return R}),me=z(()=>Object.keys(pe.value).length>0),_e=z(()=>e.value?(ce.value?K.value:K.value.filter(j=>j.key===v.value)).map(j=>({...j,sections:j.sections.filter(se=>Ce(se))})).filter(j=>j.sections.length):[]),Me=z(()=>{const R=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],j=new Map(R.map(se=>[se,[]]));for(const se of W.value){const Se=j.has(se.apply_mode)?se.apply_mode:"restart";j.get(Se).push(se)}return R.filter(se=>j.get(se).length).map(se=>({key:se,label:J(se),entries:j.get(se)}))}),T=z(()=>W.value.filter(R=>R.apply_mode==="restart").length),F=z(()=>G.value.filter(R=>R.pending_restart)),I=z(()=>F.value.length);function Z(R){const j=P.value.get(R);return j?{...j,apply_details:jl([j])}:null}function Y(R){const j=`${R}.`;return G.value.filter(se=>se.path===R||se.path.startsWith(j))}function ae(){return G.value.some(R=>R.path==="tools.hosts"||R.path.startsWith("tools.hosts."))}function ve(){var se,Se;const R=((Se=(se=e.value)==null?void 0:se.tools)==null?void 0:Se.hosts)||{},j=Object.keys(R).length;return`${j} host${j===1?"":"s"} configured.`}function H(R){return Y(R).length}function ee(R){return Hn(R)}function X(R){const j=Y(R);if(!j.length)return`${Hn(R)} configuration.`;const se=j.find(St=>St.sensitivity==="public"&&St.description)||j.find(St=>St.description),Se=(se==null?void 0:se.description)||"";return Se.match(/setting for (.+)\.$/i)?`${Hn(R)} settings and runtime behaviour.`:Se}function he(R){const j=[...new Set(Y(R).map(se=>se.apply_mode))];return j.length===1?j[0]:j.includes("restart")?"restart":j.includes("activation_required")?"activation_required":j[0]||"restart"}function fe(R){const j=[...new Set(Y(R).map(se=>J(se.apply_mode)))];return j.length?j.length===1?j[0]:`Mixed apply behaviour: ${j.join(" · ")}`:""}function ye(R){return jl(Y(R))}function Oe(R){var j;return Object.hasOwn(A.value,R)?A.value[R]:(j=e.value)==null?void 0:j[R]}function ge(){const R=Oe("mcp")||{},j=Object.keys(R.servers||{}).length;return`${R.enabled?"Globally enabled":"Globally disabled"} · ${j} configured server${j===1?"":"s"}.`}function Fe(R,j){return j.split(".").reduce((se,Se)=>se==null?void 0:se[Se],R)}function $e(R){const j=oe.value;return Y(R).filter(se=>yp(se.path)?!1:se.path.split(".").length<=2?!0:!se.path.includes(".*")).map(se=>({...se,key:se.path.split(".").at(-1),value:Fe(j,se.path),apply_details:jl([se]),editor:se.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ze(R){const j=R.path.split(".");return j.length>2?j.slice(0,2).join("."):null}function Ye(R){const j=new Map;for(const se of $e(R)){const Se=ze(se),Ke=Se||`${R}.__root`;j.has(Ke)||j.set(Ke,{key:Ke,path:Se,entries:[]}),j.get(Ke).entries.push(se)}return[...j.values()].map(se=>{const Se=se.entries.find(Ke=>Ke.group_description);return{...se,label:se.path?Hn(se.path.split(".").at(-1)):null,description:(Se==null?void 0:Se.group_description)||null,apply_details:jl(se.entries),runtime_summaries:nt(se.entries)}})}function at(R){return{save:R.save_effect||(R.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:R.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[R.apply_mode]||"Effective runtime state is not currently observable."}}function nt(R){const j=new Map;for(const se of R){const Se=at(se),Ke=`${se.apply_mode}|${Se.save}|${Se.runtime}`;j.has(Ke)||j.set(Ke,{key:Ke,label:J(se.apply_mode),save:Se.save,runtime:Se.runtime})}return[...j.values()]}function Q(R){if(xe(R))return R.runtime_effect||R.activation_policy||"";if(R.apply_mode==="activation_required"){const j=R.activation_policy||R.runtime_effect;return j?`Not active after saving. No activation control exists in this release. ${j}`:"Not active after saving; no activation control exists in this release."}return""}function xe(R){return R.action_available===!0&&!!(R.action_label&&R.action_endpoint)}async function Ee(R){if(xe(R))try{if(Dt(R.path))throw new Error("Save this setting before applying its action.");const j=String(R.action_method||"POST").toLowerCase(),se={post:B.post.bind(B),put:B.put.bind(B),delete:B.del.bind(B)}[j];if(!se)throw new Error("Unsupported configuration action");await se(R.action_endpoint,R.action_body||void 0),await dt(),bs("success",`${R.action_label} completed.`)}catch(j){bs("error",j.message||`${R.action_label} failed`)}}function Le(R,j){return[R.label,R.path,R.description,...R.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(j)}function te(R){const j=h.value.trim().toLowerCase();return j?Y(R).filter(se=>Le(se,j)):[]}function Ce(R){const j=Y(R);if(m.value!=="all"&&!j.some(Se=>Se.apply_state===m.value))return!1;const se=h.value.trim().toLowerCase();return!se||`${ee(R)} ${R}`.toLowerCase().includes(se)?!0:j.some(Se=>Le(Se,se))}function Ne(R,j){return Y(R).filter(se=>se.apply_state===j).length}function Qe(R){return R==="all"?N.value:G.value.filter(j=>j.apply_state===R).length}function Nt(R){const j=R.sections.flatMap(se=>Y(se));return{fields:j.length,modified:W.value.filter(se=>R.sections.includes(se.path.split(".")[0])).length,pending_restart:j.filter(se=>se.apply_state==="pending_restart").length,invalid:j.filter(se=>se.apply_state==="invalid").length,dormant:j.filter(se=>se.apply_state==="dormant").length}}function We(R){var j;return Object.hasOwn(A.value,R)&&!Zn((j=e.value)==null?void 0:j[R],A.value[R])}function Dt(R){return W.value.some(j=>j.path===R||j.path.startsWith(`${R}.`))}function Vt(R){v.value=R,h.value="",m.value="all";try{localStorage.setItem(pv,R)}catch{}}function ms(R){m.value=R}function ea(){h.value="",m.value="all"}function Cs(R){var j;return((j=K.value.find(se=>se.sections.includes(R)))==null?void 0:j.sections)||[]}function nn(R){const j=Cs(R),se=j.find(Se=>k.value[Se]===!0);return se||j.find(Se=>k.value[Se]!==!1)||null}function ta(R){return h.value&&!O.value&&Ce(R)?!0:O.value?nn(R)===R:Object.hasOwn(k.value,R)?k.value[R]===!0:!0}function Vs(R){const j=!ta(R);if(O.value){const se={...k.value};for(const Se of Cs(R))se[Se]===!0&&(se[Se]=!1);se[R]=j,k.value=se;return}k.value={...k.value,[R]:j}}function ha(){w.value.push(pn(A.value)),w.value.length>oS&&w.value.shift(),C.value=[]}function vs(){n.value||ue.value&&(ha(),A.value={},_.value={},S.value=!1)}function za(R,j=!1){const se=Date.now();if(j&&M.path===R&&se-M.at<rS){M.at=se;return}ha(),M={path:R,at:se}}function gs(R,j,se){if(!j.length)return se;const Se=pn(R??{});let Ke=Se;for(let St=0;St<j.length-1;St+=1){const Ws=j[St];Ke[Ws]=pn(Ke[Ws]??{}),Ke=Ke[Ws]}return Ke[j.at(-1)]=se,Se}function it(R){var j;return Object.hasOwn(A.value,R)?A.value[R]:pn((j=e.value)==null?void 0:j[R])}function Pt(R,j,se={}){var Fn;if(n.value||Vl.has(R.path.split(".")[0]))return;const[Se,...Ke]=R.path.split(".");za(R.path,!!se.coalesce);const St=it(Se),Ws=Ke.length?gs(St,Ke,j):j,sa={...A.value};if(Zn(Ws,(Fn=e.value)==null?void 0:Fn[Se])?delete sa[Se]:sa[Se]=Ws,A.value=sa,_.value[R.path]){const on={..._.value};delete on[R.path],_.value=on}}function Ds(R){M={path:null,at:0},y.value={...y.value,[R]:String(Fe(oe.value,R)??"")}}function ie(R){if(M={path:null,at:0},!Object.hasOwn(y.value,R))return;const j={...y.value};delete j[R],y.value=j}function Te(R){const j=y.value[R.path];if(M={path:null,at:0},j===""){if(R.nullable){ie(R.path),Pt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const se=Number(j);if(Number.isNaN(se)||R.type==="integer"&&!Number.isInteger(se)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Se={...y.value};delete Se[R.path],y.value=Se,Pt(R,se,{coalesce:!0})}function Ue(R){return Object.hasOwn(y.value,R.path)?y.value[R.path]:R.value??""}function et(R,j){if(y.value={...y.value,[R.path]:j},j===""){if(R.nullable){Pt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const se=Number(j);if(!Number.isFinite(se)||R.type==="integer"&&!Number.isInteger(se)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(_.value[R.path]){const Se={..._.value};delete Se[R.path],_.value=Se}Pt(R,se,{coalesce:!0})}function kt(R){const j=Number.parseInt(g.value,10);if(!Number.isInteger(j)||j<1){_.value={..._.value,[R.path]:"Warning thresholds must be positive whole numbers."};return}const se=[...new Set([...R.value||[],j])].sort((Se,Ke)=>Ke-Se);g.value="",Pt(R,se)}function ht(R,j){Pt(R,(R.value||[]).filter(se=>se!==j))}function ja(R){return R.apply_mode==="live_read"?"Odin reads the saved file value on next use.":R.apply_mode==="live_for_new_work"?"New work uses the saved file value.":R.apply_mode==="live_apply"?R.apply_handler?`Apply the saved value through ${R.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":R.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":R.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":R.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function qs(R){return R.type==="array"&&Array.isArray(R.value)&&!R.structured_container&&!R.structured_container_child&&R.sensitivity==="public"&&R.value.every(j=>["string","number","boolean"].includes(typeof j))}function wi(R){const j=String(b.value[R.path]??"").trim();if(!j)return;const se=[...new Set([...R.value||[],j])];b.value={...b.value,[R.path]:""},Pt(R,se)}function ki(R,j){Pt(R,(R.value||[]).filter(se=>se!==j))}function Ln(R,j){var Se;if(!R)return null;if((Se=R.enum)!=null&&Se.length&&!R.enum.includes(j))return`Choose one of: ${R.enum.join(", ")}`;if(R.path==="agents.final_warning_iterations"&&(!Array.isArray(j)||!j.length))return"Add at least one warning threshold.";const se=R.constraints||{};if((R.type==="integer"||R.type==="number")&&typeof j=="number"){if(se.minimum!==void 0&&j<se.minimum)return`Must be at least ${se.minimum}${R.unit?` ${R.unit}`:""}`;if(se.maximum!==void 0&&j>se.maximum)return`Must be at most ${se.maximum}${R.unit?` ${R.unit}`:""}`}return null}function Nn(R){return pe.value[R.path]||null}function ln(R){const j=`${R}.`;return Object.keys(pe.value).some(se=>se===R||se.startsWith(j))}function ma(){n.value||w.value.length&&(C.value.push(pn(A.value)),A.value=w.value.pop(),_.value={},y.value={},M={path:null,at:0})}function Gs(){n.value||C.value.length&&(w.value.push(pn(A.value)),A.value=C.value.pop(),_.value={},y.value={},M={path:null,at:0})}function va(){!ue.value||me.value||(S.value=!0,x.value=!1)}function Es(){S.value=!1}function Dn(){vs()}function J(R){return iS[R]||Hn(R||"unknown")}function ke(R){return`apply-${String(R||"unknown").replaceAll("_","-")}`}function Ae(R){return`cfgc-field-${R.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Ks(R){return`${Ae(R)}-input`}function ga(R){const j=document.getElementById(Ae(R))||document.getElementById(Ae(R.split(".").slice(0,2).join(".")));j==null||j.scrollIntoView({behavior:"smooth",block:"center"})}function bs(R,j){r.value={type:R,message:j},window.setTimeout(()=>{var se;((se=r.value)==null?void 0:se.message)===j&&(r.value=null)},3500)}function Re(){d.value=!1,m.value="pending_restart",h.value="";const R=nS(a.value);R&&(R.scrollTop=0)}function D(){d.value=!1}function re(R=1800){E&&window.clearTimeout(E),E=window.setTimeout(be,R)}async function be(){if(u.value){if(V+=1,V>45){u.value=!1,p.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ii(),I.value===0){u.value=!1,p.value=null,bs("success","Odin restarted and the saved startup settings are active.");return}}catch{}re(2e3)}}async function De(){if(!u.value){p.value=null;try{await B.post("/api/restart",{}),u.value=!0,V=0,d.value=!1,re()}catch(R){p.value=R.message||"Odin could not schedule a restart."}}}async function Be(){if(!(!ue.value||me.value||n.value)){n.value=!0;try{const R=uS(e.value,A.value),j=await B.put("/api/config",R);e.value=j,A.value={},w.value=[],C.value=[],_.value={},S.value=!1;try{t.value=await Ii(),c.value=null,d.value=I.value>0,bs("success",I.value?`Configuration saved. ${I.value} setting${I.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(se){c.value=se.message||"Unknown metadata error.",bs("error",`Configuration saved, but apply status could not be refreshed: ${c.value}`)}}catch(R){bs("error",R.message||"Configuration could not be saved")}finally{n.value=!1}}}async function je(){if(!n.value){n.value=!0,i.value=null;try{t.value=await Ii(),c.value=null}catch(R){i.value=`Image model status could not be refreshed: ${R.message||"Unknown error"}`}finally{n.value=!1}}}async function Rt(R,j){if(n.value||!["follow","pin"].includes(j)||!R.length||R.some(Se=>{var Ke,St;return!l.includes(Se)||!((St=(Ke=t.value)==null?void 0:Ke.image_model_defaults)!=null&&St[Se])}))return;n.value=!0,i.value=null;let se=!1;try{const Se=await B.post("/api/config/image-models",{operations:Object.fromEntries(R.map(Ke=>[Ke,j])),expected_revision:t.value.image_model_revision});se=!0;for(const Ke of R){const St=`image.openai.${Ke}`,Ws=Fe(e.value,St),sa=Fe(Se.config,St),Fn=on=>!Object.hasOwn(on,"image")||!Zn(Fe(on,St),Ws)?on:gs(on,St.split("."),sa);A.value=Fn(A.value),w.value=w.value.map(Fn),C.value=C.value.map(Fn),e.value=gs(e.value,St.split("."),sa)}t.value={...t.value,image_model_defaults:Se.image_model_defaults,image_model_revision:Se.image_model_revision},bs("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(Se){i.value=`Image model operation failed: ${Se.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ii(),c.value=null}catch(Se){const Ke=`Image model status could not be refreshed: ${Se.message||"Unknown error"}`;c.value=Ke,i.value=se?`Image model defaults were saved, but ${Ke}`:`${i.value} ${Ke}`}finally{n.value=!1}}async function dt(){var R,j;if(!(ue.value||n.value)){s.value=!0,o.value=null;try{const se=await B.get("/api/config"),Se=await Ii();e.value=se,t.value=Se,c.value=null;const Ke=K.value;if(Ke.some(St=>St.key===v.value)||(v.value=((R=Ke[0])==null?void 0:R.key)||li[0].key),O.value){const Ws=(((j=Ke.find(sa=>sa.key===v.value))==null?void 0:j.sections)||[]).find(sa=>k.value[sa]===!0);k.value=Ws?{...k.value,[Ws]:!0}:{}}}catch(se){o.value=se.message||"Unknown configuration error"}finally{s.value=!1}}}function bt(R){if(S.value||!(R.ctrlKey||R.metaKey))return;const j=R.target;j instanceof HTMLElement&&(j.matches("input, textarea, select")||j.isContentEditable)||(!R.shiftKey&&R.key.toLowerCase()==="z"?(R.preventDefault(),ma()):(R.key.toLowerCase()==="y"||R.shiftKey&&R.key.toLowerCase()==="z")&&(R.preventDefault(),Gs()))}function Ps(R){O.value=R.matches}Ut(k,R=>{try{localStorage.setItem(uv,JSON.stringify(R))}catch{}},{deep:!0});let wt=!1;function Pn(){wt||(wt=!0,document.addEventListener("keydown",bt))}function Mn(){wt&&(wt=!1,document.removeEventListener("keydown",bt))}return Ge(()=>{var R;dt(),Pn(),$=window.matchMedia("(max-width: 760px)"),Ps($),(R=$.addEventListener)==null||R.call($,"change",Ps)}),es(Pn),Wt(Mn),ft(()=>{var R;Mn(),(R=$==null?void 0:$.removeEventListener)==null||R.call($,"change",Ps),E&&window.clearTimeout(E)}),{armKeydown:Pn,disarmKeydown:Mn,handleKeydown:bt,config:e,meta:t,loading:s,saving:n,error:o,toast:r,metaRefreshError:c,restartPromptOpen:d,restartScheduled:u,restartError:p,configMain:a,imageModelError:i,imageModelLeaves:l,setImageModelDefaults:Rt,refreshImageModelMetadata:je,searchQuery:h,healthFilter:m,activeCategory:v,reviewOpen:S,mobileOverflowOpen:x,warningThresholdInput:g,arrayInputs:b,healthFilters:ne,visibleCategories:K,displayGroups:_e,reviewGroups:Me,sectionCount:L,fieldCount:N,hasChanges:ue,changeCount:de,changedSectionCount:q,hasDraftErrors:me,canUndo:le,canRedo:U,globalFilterActive:ce,reviewRestartCount:T,pendingRestartCount:I,pendingRestartFields:F,healthCount:Qe,categoryStats:Nt,selectCategory:Vt,selectHealthFilter:ms,clearFilters:ea,sectionLabel:ee,sectionDescription:X,sectionFieldCount:H,sectionHealthCount:Ne,sectionApplySummary:fe,sectionApplyDetails:ye,sectionEntries:$e,fieldGroups:Ye,sectionSearchHits:te,mcpConfigSummary:ge,fieldRuntimeCopy:at,fieldSpecificRuntimeNote:Q,hasHonestAction:xe,runFieldAction:Ee,hasHostsCollection:ae,hostsConfigSummary:ve,sectionChanged:We,fieldChanged:Dt,isSectionExpanded:ta,toggleSection:Vs,discardAllDrafts:vs,setFieldValue:Pt,setNumberFieldValue:et,numberInputValue:Ue,beginInputEdit:Ds,endTextInputEdit:ie,endInputEdit:Te,addWarningThreshold:kt,removeWarningThreshold:ht,isScalarArray:qs,addScalarArrayItem:wi,removeScalarArrayItem:ki,fieldError:Nn,sectionHasErrors:ln,undo:ma,redo:Gs,openReview:va,closeReview:Es,mobileCancel:Dn,applyModeLabel:J,applyClass:ke,compactValue:cS,formatValue:dS,structuredApplyCopy:ja,fieldId:Ae,fieldInputId:Ks,focusField:ga,fetchConfig:dt,saveConfig:Be,restartOdin:De,restartLater:D,reviewPendingRestart:Re}}},mS=/^\d{15,25}$/;function mv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const vv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=z(()=>new Set((e.excludedIds||[]).map(String))),o=z(()=>{const _=s.value.toLowerCase().trim();return(e.members||[]).filter(w=>l.value.has(String(w.id))?!1:_?u(w).toLowerCase().includes(_)||String(w.username||"").toLowerCase().includes(_)||String(w.id).includes(_):!0)}),r=z(()=>{const _=s.value.trim();return o.value.length===0&&mS.test(_)&&!l.value.has(_)?_:""}),c=z(()=>o.value.length+(r.value?1:0)),d=z(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(_){return mv(_)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const _=Math.max(c.value-1,0);n.value=Math.min(n.value+1,_)}function v(){n.value=Math.max(n.value-1,0)}function k(){const _=o.value[n.value];_?A(_):r.value&&n.value===o.value.length&&y(r.value)}function A(_){y(String(_.id))}function y(_){t("select",_),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function b(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&Ot(()=>{var _;return(_=i.value)==null?void 0:_.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:k,selectMember:A,selectId:y,closeOptions:g,onBlur:b}}};function xp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const vS={components:{DiscordUserCombobox:vv},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),h=f({}),m=f([]);let v=0;const k=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),A=z(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=z(()=>new Map(m.value.map(de=>[String(de.id),de])));function g(de){return de.config&&de.config.enabled!==void 0?de.config.enabled:!0}function b(de){return xp(de,"require_mention",c.value)}function _(de){return xp(de,"respond_to_bots",c.value)}function w(de){return de.config&&Object.keys(de.config).length>0}function C(de){r.value[de]=!r.value[de]}function S(de){const q=de.discord||{};return{allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]}}async function x({showLoading:de=!0}={}){const q=++v;de&&(l.value=!0),o.value=null;try{const ce=await B.get("/api/discord/guilds");q===v&&(e.value=ce)}catch(ce){q===v&&(o.value=ce.message)}finally{de&&q===v&&(l.value=!1)}}async function O(){try{t.value=await B.get("/api/discord/connection"),n.value=null}catch(de){n.value=de.message}}async function $(de,q=null){if(!a.value){a.value=!0,n.value=null;try{const ce={operation:de};q!==null&&(ce.token=q),t.value=await B.post("/api/discord/connection",ce),de==="credentials"&&(s.value="")}catch(ce){n.value=ce.message||"Connection update failed."}finally{a.value=!1}}}function E(){return $("credentials",s.value)}function M(){return $("connect")}function V(){return $("detach")}async function G(){l.value=!0,o.value=null;try{const[de,q,ce]=await Promise.all([B.get("/api/discord/guilds"),B.get("/api/discord/members").catch(()=>[]),B.get("/api/config")]),pe=S(ce),me=A.value;c.value=pe,me||(d.value=JSON.parse(JSON.stringify(pe))),m.value=q,e.value=de,p.value=null}catch(de){o.value=de.message}finally{l.value=!1}}let P=Promise.resolve();const L=f(new Set);function N(de,q){const ce=new Set(L.value);ce.add(de),L.value=ce;const pe=P.then(q);return P=pe.catch(()=>{}),pe.finally(()=>{const me=new Set(L.value);me.delete(de),L.value=me})}function ne(de,q,ce,pe){const me=(pe==null?void 0:pe.target)??null;return N(`guild:${de}:${q}`,async()=>{try{await B.put("/api/discord/guild/"+de+"/config",{[q]:ce}),await x({showLoading:!1})}catch(_e){o.value=_e.message,me&&typeof ce=="boolean"&&(me.checked=!ce)}})}function le(de,q,ce,pe,me){const _e=(me==null?void 0:me.target)??null;return N(`channel:${de}:${ce}`,async()=>{try{await B.put("/api/discord/channel/"+de+"/config",{[ce]:pe}),await x({showLoading:!1})}catch(Me){o.value=Me.message,_e&&typeof pe=="boolean"&&(_e.checked=!pe)}})}function U(de,q){return N(`channel:${de}:clear`,async()=>{try{await B.put("/api/discord/channel/"+de+"/config",{clear:!0}),await x({showLoading:!1})}catch(ce){o.value=ce.message}})}function K(de,q){const ce=String(q);if(!de.userAutocomplete)return ce;const pe=y.value.get(ce);return pe?mv(pe):ce}function oe(de,q=null){const ce=String(q??h.value[de]??"").trim();!ce||d.value[de].includes(ce)||(d.value[de]=[...d.value[de],ce],h.value={...h.value,[de]:""})}function W(de,q){d.value[de]=d.value[de].filter(ce=>ce!==q)}async function ue(){if(!(!A.value||u.value)){u.value=!0,p.value=null;try{const q=(await B.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(de){p.value=de.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Ge(()=>{G(),O(),i=window.setInterval(O,5e3)}),ft(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:h,globalMembers:m,globalListEditors:k,globalChanged:A,guildEnabled:g,guildMention:b,guildBots:_,hasOverride:w,toggleGuild:C,fetchAll:G,fetchGuilds:x,setGuildConfig:ne,setChannelConfig:le,clearOverride:U,mutationPending:L,globalItemLabel:K,addGlobalItem:oe,removeGlobalItem:W,saveGlobalDefaults:ue,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:E,connectDiscord:M,detachDiscord:V}}},As=e=>e==null?e:JSON.parse(JSON.stringify(e));function gS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(w){d+=1;const C=c.then(w,w);return c=C.catch(()=>{}),C}function k(w,C){h=As(w),m.clear();for(const[S,x]of Object.entries(C||{}))m.set(S,As(x))}function A(w){const C=As(w),S=++u;return v(async()=>{try{await e(As(C)),h=As(C),S===u&&a(As(C))}catch(x){S===u&&(n(As(h)),r(x,{kind:"default"}))}})}function y(w,C){const S=As(C),x=(p.get(w)||0)+1;return p.set(w,x),v(async()=>{try{await t(w,As(S)),m.set(w,As(S)),x===p.get(w)&&i(w,As(S))}catch(O){x===p.get(w)&&(l(w,As(m.get(w)??null)),r(O,{kind:"user",uid:w}))}})}function g(w){const C=(p.get(w)||0)+1;return p.set(w,C),v(async()=>{try{await s(w),m.delete(w),C===p.get(w)&&o(w)}catch(S){C===p.get(w)&&(l(w,As(m.get(w)??null)),r(S,{kind:"delete",uid:w}))}})}async function b(){for(;;){const w=c;if(await w,w===c)return d}}async function _(w){for(;;){const C=await b(),S=await w();if(C===d)return S}}return{seed:k,saveDefault:A,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:_,get revision(){return d}}}const bS={components:{DiscordUserCombobox:vv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=z(()=>{const E={};for(const M of r.value)E[M.id]=M;return E});function d(E){return c.value[E]||null}function u(E,M){return E?E.allowed_hosts===null||E.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:E.default_host||"",allow_all:!0}:{allowed_hosts:E.allowed_hosts,default_host:E.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=gS({applyDefault:async E=>{const M=E.allow_all?null:E.allowed_hosts;await B.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:E.default_host})},applyUser:async(E,M)=>{const V=M.allow_all?null:M.allowed_hosts;await B.put(`/api/host-access/user/${E}`,{allowed_hosts:V,default_host:M.default_host})},applyDelete:E=>B.del(`/api/host-access/user/${E}`),onDefaultConfirmed:()=>we.success("Default policy updated"),onDefaultRollback:E=>{E&&(i.value=E)},onUserConfirmed:E=>{const M=d(E);we.success(`Updated access for ${M?M.display_name:E}`)},onUserRollback:(E,M)=>{const V={...l.value};M?V[E]=M:delete V[E],l.value=V},onUserDeleted:E=>{const M={...l.value};delete M[E],l.value=M},onError:(E,M)=>{var G;const V=M.uid?` ${((G=d(M.uid))==null?void 0:G.display_name)||M.uid}`:"";we.error(`${E.message||"Failed to save"} — reverted${V}`)}});let h=0;async function m(){const E=++h;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>B.get("/api/host-access"));if(E!==h)return;s.value=M,a.value=M.available_hosts||[],n.value=M.host_descriptions||{},i.value=u(M.default_policy,a.value);const V=M.users||{},G={};for(const[P,L]of Object.entries(V))G[P]=u(L,a.value);l.value=G,p.seed(i.value,G)}catch(M){E===h&&(t.value=M.message||"Failed to fetch host access data")}finally{E===h&&(e.value=!1)}try{const M=await B.get("/api/discord/members")||[];E===h&&(r.value=M)}catch{E===h&&(r.value=[])}}const v=500,k=new Map;function A(E,M){const V=k.get(E);V&&clearTimeout(V.timer);const G={run:M,timer:null};G.timer=setTimeout(()=>{k.delete(E),M()},v),k.set(E,G)}function y(E){const M=k.get(E);M&&(clearTimeout(M.timer),k.delete(E))}function g(){for(const[E,M]of[...k])clearTimeout(M.timer),k.delete(E),M.run()}function b(){A("default",()=>p.saveDefault(i.value))}function _(E,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(E)||i.value.allowed_hosts.push(E):(i.value.allowed_hosts=i.value.allowed_hosts.filter(V=>V!==E),i.value.default_host===E&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function w(E){A(`user:${E}`,()=>{const M=l.value[E];M&&p.saveUser(E,M)})}function C(E,M,V){const G=l.value[E];G&&(G.allow_all=!1,V?G.allowed_hosts.includes(M)||G.allowed_hosts.push(M):(G.allowed_hosts=G.allowed_hosts.filter(P=>P!==M),G.default_host===M&&(G.default_host=G.allowed_hosts[0]||"")),w(E))}function S(E,M){const V=l.value[E];V&&(V.default_host=M,w(E))}function x(){o.value=!0}function O(E){!/^\d{15,25}$/.test(E)||l.value[E]||(l.value[E]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(E,l.value[E]),o.value=!1)}async function $(E){const M=d(E);await Kt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:E}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${E}`),await p.deleteUser(E),l.value[E]||we.success(`Removed override for ${M?M.display_name:E}`))}return Ge(m),Wt(g),ft(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:_,getMember:d,toggleUserHost:C,setUserDefault:S,openAddUser:x,addUserById:O,deleteUser:$,flushPendingSaves:g}}},yS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),k=f(v()),A=z(()=>["127.0.0.1","localhost","::1"].includes(k.value.address));async function y(){t.value=!0,s.value="";try{const G=await B.get("/api/hosts");e.value=G.hosts||[],o.value=G.default_host||"",r.value=!!G.tofu_enabled}catch(G){s.value=G.message}finally{t.value=!1}}async function g(){try{await B.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),we.success("Host settings saved and published live"),await y()}catch(G){we.error(G.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function _(){i.value=!1,k.value=v(),b()}function w(G){i.value=!0,k.value={...v(),...G},b()}async function C(){try{c.value=await B.get("/api/hosts/public-key")}catch(G){we.error(G.message)}}async function S(G){try{const P=await B.post("/api/hosts/"+encodeURIComponent(G.alias)+"/import-legacy",{});i.value=!0,k.value={...v(),...G,trust_mode:"pinned"},b(),d.value=P.candidate_token,u.value=P.fingerprints||[],m.value=u.value.join(`
`),l.value=4,we.info("Imported existing known_hosts trust. Test before activation.")}catch(P){we.error(P.message)}}async function x(){try{const G=m.value.split(/\s+/).filter(Boolean),P={...k.value,expected_fingerprints:G,candidate_fingerprints:u.value},L=await B.post("/api/hosts/candidates",P);if(d.value=L.candidate_token,u.value=L.fingerprints||[],k.value.trust_mode==="tofu"&&P.candidate_fingerprints.length===0){k.value.confirm_tofu=!1,we.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(G){we.error(G.message)}}async function O(){var G,P;p.value=!1,h.value=null;try{const L=await B.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!L.tested,h.value=L.last_test,p.value&&(l.value=5)}catch(L){const N=(G=L.data)==null?void 0:G.last_test;N&&typeof N=="object"&&!Array.isArray(N)&&(h.value=N);const ne=(P=h.value)==null?void 0:P.detail;we.error(typeof ne=="string"&&ne.trim()?ne:L.message)}}async function $(){try{await B.post("/api/hosts/candidates/"+d.value+"/commit",{}),we.success("Host saved and published live"),n.value=!1,await y()}catch(G){we.error(G.message)}}async function E(G){try{await B.post("/api/hosts/"+encodeURIComponent(G.alias)+"/enabled",{enabled:!G.enabled}),await y()}catch(P){we.error(P.message)}}async function M(G){var P;if(await Kt("Delete host "+G.alias+"? Dependencies will block deletion.")){a.value=[];try{await B.del("/api/hosts/"+encodeURIComponent(G.alias)),await y()}catch(L){a.value=Array.isArray((P=L.data)==null?void 0:P.pending_references)?L.data.pending_references:[],we.error(L.message)}}}async function V(G){if(await Kt("Force revoke "+G.alias+"? Remote outcomes may be unknown."))try{await B.post("/api/hosts/"+encodeURIComponent(G.alias)+"/force-revoke",{}),await y()}catch(P){we.error(P.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:k,isLocal:A,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:g,beginAdd:_,beginEdit:w,loadKey:C,importLegacy:S,prepare:x,testConnection:O,commit:$,toggle:E,remove:M,forceRevoke:V}}},xS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=z(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=z(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const S=await B.get("/api/tokens");s.value=S.tokens||[],a.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function v(S){return!S||!S.trim()?[]:S.split(",").map(x=>x.trim()).filter(Boolean)}function k(S,x){const O=c.value.allowed_hosts;if(x&&!O.includes(S)&&O.push(S),!x){const $=O.indexOf(S);$>=0&&O.splice($,1)}}function A(S,x){const O=d.value.allowed_hosts;if(x&&!O.includes(S)&&O.push(S),!x){const $=O.indexOf(S);$>=0&&O.splice($,1)}}async function y(){var S;i.value=!0;try{const x=v(c.value.allowed_tools_str),O=c.value.host_mode,$=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,E={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};$!==null&&(E.allowed_hosts=$),E.default_host=c.value.default_host||"";const M=await B.post("/api/tokens",E);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,we.success("Token created"),await m()}catch(x){we.error(((S=x.data)==null?void 0:S.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(S){o.value=S;const x=S.allowed_hosts;let O="default";x==null?O="default":Array.isArray(x)&&x.length===0?O="none":Array.isArray(x)&&(O="select"),d.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:O,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function b(){var S;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),O=d.value.host_mode,$={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};O==="none"?$.allowed_hosts=[]:O==="select"?$.allowed_hosts=d.value.allowed_hosts:$.allowed_hosts=null,$.default_host=d.value.default_host||"",await B.put("/api/tokens/"+encodeURIComponent(o.value.user_id),$),o.value=null,we.success("Token updated"),await m()}catch(x){we.error(((S=x.data)==null?void 0:S.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function _(S){var O;if(await Kt({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await B.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=$.token,we.success("Token regenerated")}catch($){we.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to regenerate")}}async function w(S){var O;if(await Kt({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/tokens/"+encodeURIComponent(S.user_id)),we.success("Token deleted"),await m()}catch($){we.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to delete")}}async function C(){if(l.value)try{await navigator.clipboard.writeText(l.value),we.success("Copied to clipboard")}catch{we.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:k,toggleEditHost:A,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:_,confirmDelete:w,copyToken:C}}},_S=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),wS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),kS=Object.freeze(["enabled","base_url","model","max_tokens"]),SS=Object.freeze(["enabled","model","max_tokens"]);function cr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function _p(e){return cr(e,_S)}function wp(e){return cr(e,wS)}function TS(e,{includeApiKey:t=!1}={}){const s=cr(e,kS);return t&&(s.api_key=e.api_key),s}function CS(e){return{timeout:e.timeout}}function ES(e,{includeApiKey:t=!1}={}){const s=cr(e,SS);return t&&(s.api_key=e.api_key),s}function AS(e){return{timeout:e.timeout}}function ql(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const RS={template:`
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
                <input type="radio" value="kimi" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.kimi.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.kimi.configured ? 'text-gray-200' : 'text-gray-500'">
                  Kimi (Moonshot AI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.kimi.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.kimi.configured" class="text-xs text-gray-500">
                  {{ llmStatus.kimi.model }}
                </span>
                <span v-if="llmStatus.serving_provider === 'kimi'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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

        <!-- ==================== Kimi Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Kimi (Moonshot AI)</h2>
            <div class="flex items-center gap-3">
              <div v-if="kimiStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="kimiStatus.configured" class="text-sm">
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
          <div v-if="kimiStatus?.health && kimiStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ kimiStatus.health.error }}
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=z(()=>{const J=n.value.model;return J&&!i.includes(J)?[J,...i]:i}),o=z(()=>{const J=n.value.agent_model;return J&&J!=="auto"&&!i.includes(J)?[J,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(J,ke)=>!!J&&!!ke&&(r[J]||[]).includes(ke),d=J=>!c(n.value.model,J)&&!(n.value.agent_reasoning_effort===""&&c(n.value.agent_model,J)),u=J=>{const ke=n.value.agent_model;return ke==="auto"?!0:!c(ke||n.value.model,J)},p=z(()=>{const J=n.value.agent_reasoning_effort;return J==="auto"?null:J||n.value.reasoning_effort}),h=J=>c(J,n.value.reasoning_effort)||n.value.agent_model===""&&c(J,p.value),m=J=>c(J,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),k=f({unavailable_reason:null}),A=z(()=>{const J=v.value.model;return J&&!i.includes(J)?[J,...i]:i});function y(J){const ke=J.target.value;v.value.enabled=ke!=="",ke!==""&&(v.value.model=ke),ie()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),_=f(null),w=f(!1),C=f(""),S=f(null),x=f(!1);let O=0;const $=z(()=>{var J;return Object.entries(((J=_.value)==null?void 0:J.models)||{}).map(([ke,Ae])=>{var Ks,ga,bs;return{model:ke,floor:Ae.floor,override:Ae.override,effectiveBudget:(Ks=Ae.effective)==null?void 0:Ks.effective_budget,configuredPrimaryChars:(ga=Ae.configured)==null?void 0:ga.primary_chars,primaryChars:(bs=Ae.effective)==null?void 0:bs.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at,densityPriorMilli:Ae.density_prior_milli,densityScope:Ae.density_scope,workloadCalibration:Ae.workload_calibration}})}),E=z(()=>{var J;return((J=_.value)==null?void 0:J.clamps)||[]}),M=z(()=>{var J,ke;return((ke=(J=_.value)==null?void 0:J.models)==null?void 0:ke[n.value.model])||null}),V=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),G=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),P=f(!1),L=f(!1),N=f(!1),ne=f(!1),le=f(!1),U=f(!1),K=f(!1),oe=f({configured:null}),W=f(!1),ue=f([]),de=f(""),q=f(!1),ce=f(!1),pe=f({configured:null}),me=f(!1),_e=f([]),Me=f(""),T=f(!1),F=f(!1),I=f(!0),Z=f(""),Y=f({configured:null,accounts:[]}),ae=f(null),ve=f(null),H=f(""),ee=f(null),X=f(!1),he=f(null),fe=f(null),ye=f("");let Oe=null;function ge(J,ke="success"){we(J,ke==="error"?"error":"success")}function Fe(J){if(!J)return"?";const ke=J/(1024*1024*1024);return ke>=1?ke.toFixed(1)+" GB":(J/(1024*1024)).toFixed(0)+" MB"}function $e(J){return Number.isFinite(Number(J))?Number(J).toLocaleString():"—"}function ze(J){return J==null?"automatic (model-derived)":Number(J).toLocaleString()+" characters"}function Ye(J){const ke=new Date(J);return Number.isNaN(ke.getTime())?"unknown":ke.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function at(J){return typeof J=="string"&&J.length>12?J.slice(0,8)+"…"+J.slice(-4):J}function nt(J){return typeof J!="number"||!Number.isFinite(J)?"—":(J/1e3).toFixed(2)}function Q(J){return J==="temporary learned clamp"?"is-clamp":J==="override"?"is-override":"is-built-in"}function xe(J){const ke=n.value.context_budget_overrides[J.model];return J.floor!=null&&Number.isFinite(Number(ke))&&Number(ke)>J.floor}function Ee(J,ke){const Ae={...n.value.context_budget_overrides};ke.target.value===""?delete Ae[J]:Ae[J]=Number(ke.target.value),n.value.context_budget_overrides=Ae,x.value=!0}function Le(J){n.value.context_utilization=J.target.value===""?"":Number(J.target.value),x.value=!0}function te(J){const ke={...n.value.context_budget_overrides};delete ke[J],n.value.context_budget_overrides=ke,x.value=!0}async function Ce(){e.value=!0,await Promise.all([Ne(),Nt(),Cs(),We(),Qe()]),e.value=!1}async function Ne({preserveBasic:J=!1,preserveAdvanced:ke=!1}={}){try{const Ae=await B.get("/api/llm/status");t.value=Ae,s.value=!1,a.value=Ae.active_provider||"codex",Ae.codex&&!Ds.pending()&&(J||(n.value.enabled=Ae.codex.enabled,n.value.model=Ae.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",n.value.agent_model=Ae.codex.agent_model||""),ke||(n.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ae.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ae.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ae.codex.context_compression||{}},!x.value&&!N.value&&(n.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},n.value.context_utilization=Ae.codex.context_utilization??n.value.context_utilization))),Ae.ollama&&!Te.pending()&&(J||(V.value.enabled=Ae.ollama.enabled,V.value.base_url=Ae.ollama.base_url||"",V.value.model=Ae.ollama.model||"",V.value.max_tokens=Ae.ollama.max_tokens||4096),ke||(V.value.timeout=Ae.ollama.timeout??V.value.timeout)),Ae.kimi&&!Ue.pending()&&(J||(G.value.enabled=Ae.kimi.enabled,G.value.model=Ae.kimi.model||"",G.value.max_tokens=Ae.kimi.max_tokens||4096),ke||(G.value.timeout=Ae.kimi.timeout??G.value.timeout)),Ae.auxiliary&&(k.value=Ae.auxiliary,ie.pending()||(v.value.enabled=Ae.auxiliary.enabled,v.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Qe(){const J=++O;w.value=!0,C.value="";try{const ke=await B.get("/api/context/windows");if(J!==O)return;_.value=ke,!N.value&&!x.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ke.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,Ks])=>[Ae,Ks.override])),n.value.context_utilization=ke.utilization??n.value.context_utilization)}catch(ke){J===O&&(C.value=ke.message||"Failed to load context budgets")}finally{J===O&&(w.value=!1)}}async function Nt(){try{if(oe.value=await B.get("/api/ollama/status"),W.value=!1,oe.value.model&&(de.value=oe.value.model),oe.value.configured)try{const J=await B.get("/api/ollama/models");ue.value=J.models||[]}catch{ue.value=[]}else if(V.value.base_url)try{const J=await B.post("/api/ollama/probe-models",{base_url:V.value.base_url});ue.value=J.models||[]}catch{ue.value=[]}}catch{W.value=!0}}async function We(){I.value=!0,Z.value="";try{Y.value=await B.get("/api/codex/status")}catch(J){Z.value=J.message||"Failed to fetch Codex status"}finally{I.value=!1}}async function Dt(){const J=t.value?t.value.active_provider:"codex";K.value=!0;try{const ke=await B.post("/api/llm/switch",{provider:a.value});ke.error?(a.value=J,ge(ke.error,"error")):(ge("Switched to "+a.value+" ("+ke.model+")"),await Ce())}catch(ke){a.value=J,ge(ke.message||"Switch failed","error")}finally{K.value=!1}}async function Vt(){q.value=!0;try{const J=await B.post("/api/ollama/reload");ge(J.configured?"Ollama reloaded":J.reason||"Ollama not configured",J.configured?"success":"error"),await Ce()}catch(J){ge(J.message||"Reload failed","error")}finally{q.value=!1}}async function ms(){ce.value=!0;try{await B.post("/api/ollama/model",{model:de.value}),ge("Model set to "+de.value),await Ce()}catch(J){ge(J.message||"Failed","error")}finally{ce.value=!1}}async function ea(){const J=V.value.base_url;if(!J){ge("Enter a base URL first","error");return}U.value=!0;try{const ke=await B.post("/api/ollama/probe-models",{base_url:J});ue.value=ke.models||[],ue.value.length?(ge(ue.value.length+" model(s) found"),!V.value.model&&ue.value.length&&(V.value.model=ue.value[0].name)):ge("No models found at "+J,"error")}catch(ke){ge(ke.message||"Could not reach Ollama","error")}finally{U.value=!1}}async function Cs(){try{if(pe.value=await B.get("/api/kimi/status"),me.value=!1,pe.value.model&&(Me.value=pe.value.model),pe.value.configured)try{const J=await B.get("/api/kimi/models");_e.value=J.models||[]}catch{_e.value=[]}}catch{me.value=!0}}async function nn(){T.value=!0;try{const J=await B.post("/api/kimi/reload");ge(J.configured?"Kimi reloaded":J.reason||"Kimi not configured",J.configured?"success":"error"),await Ce()}catch(J){ge(J.message||"Reload failed","error")}finally{T.value=!1}}async function ta(){F.value=!0;try{await B.post("/api/kimi/model",{model:Me.value}),ge("Model set to "+Me.value),await Ce()}catch(J){ge(J.message||"Failed","error")}finally{F.value=!1}}async function Vs(){if(N.value){Ds();return}N.value=!0;const J=_p(n.value);try{await B.put("/api/llm/codex/config",J),ge("Codex config saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),We()])}catch(ke){ge(ke.message||"Failed","error");const Ae=JSON.stringify(_p(n.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:Ae,preserveAdvanced:!0}),We()])}finally{N.value=!1}}async function ha(){if(N.value)return;N.value=!0;const J=wp(n.value);try{await B.put("/api/llm/codex/config",J),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:J.context_budget_overrides,context_utilization:J.context_utilization})&&(x.value=!1),ge("Codex advanced settings saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),We(),Qe()])}catch(ke){ge(ke.message||"Failed","error");const Ae=JSON.stringify(wp(n.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:Ae}),We(),Qe()])}finally{N.value=!1}}async function vs(){if(ne.value){Te();return}ne.value=!0;try{const J=P.value?V.value.api_key:null,ke=TS(V.value,{includeApiKey:J!==null});await B.put("/api/llm/ollama/config",ke),ge("Ollama config saved"),J!==null&&V.value.api_key===J&&(V.value.api_key="",P.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(J){ge(J.message||"Failed","error")}finally{ne.value=!1}}async function za(){if(!ne.value){ne.value=!0;try{await B.put("/api/llm/ollama/config",CS(V.value)),ge("Ollama timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(J){ge(J.message||"Failed","error")}finally{ne.value=!1}}}async function gs(){if(le.value){Ue();return}le.value=!0;try{const J=L.value?G.value.api_key:null,ke=ES(G.value,{includeApiKey:J!==null});await B.put("/api/llm/kimi/config",ke),ge("Kimi config saved"),J!==null&&G.value.api_key===J&&(G.value.api_key="",L.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Cs()])}catch(J){ge(J.message||"Failed","error")}finally{le.value=!1}}async function it(){if(!le.value){le.value=!0;try{await B.put("/api/llm/kimi/config",AS(G.value)),ge("Kimi timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Cs()])}catch(J){ge(J.message||"Failed","error")}finally{le.value=!1}}}async function Pt(){if(g.value){ie();return}g.value=!0;try{await B.put("/api/llm/auxiliary/config",v.value),ge("Auxiliary config saved"),await Ne()}catch(J){ge(J.message||"Failed","error"),await Ne()}finally{g.value=!1}}const Ds=ql(Vs),ie=ql(Pt),Te=ql(vs),Ue=ql(gs),et=()=>(Ds.cancel(),Vs()),kt=()=>(Te.cancel(),vs()),ht=()=>(Ue.cancel(),gs()),ja=()=>ha(),qs=()=>za(),wi=()=>it();async function ki(J){const ke=J.account_key+":"+J.model;S.value=ke;try{const Ae=await B.post("/api/context/windows/clear",{account_key:J.account_key,model:J.model});ge(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Qe()}catch(Ae){ge(Ae.message||"Failed to clear clamp","error"),await Qe()}finally{S.value=null}}async function Ln(J){try{await B.post("/api/codex/account/"+J+"/activate"),ge("Active account switched"),await We()}catch(ke){ge(ke.message||"Failed","error")}}async function Nn(J){ae.value=J;try{await B.post("/api/codex/account/"+J+"/refresh"),ge("Token refreshed"),await We()}catch(ke){ge(ke.message||"Refresh failed","error")}finally{ae.value=null}}function ln(J,ke){ve.value=J,H.value=ke||""}async function ma(J){try{await B.put("/api/codex/account/"+J+"/label",{label:H.value}),ge("Label updated"),ve.value=null,await We()}catch(ke){ge(ke.message||"Failed","error")}}async function Gs(J,ke){if(await Kt({title:"Delete Codex account",message:`Delete ${ke||"account #"+(J+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/codex/account/"+J),ge("Deleted. Pool reloaded."),await We()}catch(Ks){ge(Ks.message||"Failed","error")}}async function va(){X.value=!0;try{const J=await B.post("/api/codex/device-code");he.value=J,ee.value="pending",Es(J)}catch(J){ge(J.message||"Failed","error")}finally{X.value=!1}}async function Es(J){Oe={cancelled:!1};const ke=Oe;try{const Ae=await B.post("/api/codex/device-poll",{device_auth_id:J.device_auth_id,user_code:J.user_code,interval:J.interval});if(ke.cancelled)return;fe.value=Ae,ee.value="success",await Ce()}catch(Ae){if(ke.cancelled)return;ye.value=Ae.message||"Device login failed",ee.value="error"}}function Dn(){Oe&&(Oe.cancelled=!0),ee.value=null,he.value=null}return Ge(Ce),ft(()=>{Oe&&(Oe.cancelled=!0),Ds.cancel(),ie.cancel(),Te.cancel(),Ue.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:K,advancedOpen:b,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:k,auxModelOptions:A,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:ie,ollamaForm:V,kimiForm:G,savingCodex:N,savingOllama:ne,savingKimi:le,probingOllama:U,ollamaKeyDirty:P,kimiKeyDirty:L,fetchCodexStatus:We,ollamaStatus:oe,ollamaStatusLoadFailed:W,ollamaModels:ue,ollamaSelectedModel:de,reloading:q,settingModel:ce,kimiStatus:pe,kimiStatusLoadFailed:me,kimiModels:_e,kimiSelectedModel:Me,reloadingKimi:T,settingKimiModel:F,codexLoading:I,codexError:Z,codexData:Y,refreshing:ae,editingLabel:ve,labelValue:H,contextWindows:_,contextWindowsLoading:w,contextWindowsError:C,contextBudgetRows:$,activeClampRows:E,activeContextBudget:M,clearingClamp:S,contextPolicyDirty:x,deviceState:ee,deviceLoading:X,deviceInfo:he,deviceResult:fe,deviceError:ye,fetchAll:Ce,fetchLLMStatus:Ne,fetchOllamaStatus:Nt,fetchKimiStatus:Cs,switchProvider:Dt,reloadOllama:Vt,setOllamaModel:ms,reloadKimi:nn,setKimiModel:ta,probeOllamaModels:ea,saveCodexConfig:Vs,saveOllamaConfig:vs,saveKimiConfig:gs,saveCodexAdvancedConfig:ha,saveOllamaAdvancedConfig:za,saveKimiAdvancedConfig:it,saveCodexConfigDebounced:Ds,saveOllamaConfigDebounced:Te,saveKimiConfigDebounced:Ue,saveCodexConfigNow:et,saveOllamaConfigNow:kt,saveKimiConfigNow:ht,saveCodexAdvancedConfigNow:ja,saveOllamaAdvancedConfigNow:qs,saveKimiAdvancedConfigNow:wi,activateAccount:Ln,refreshAccount:Nn,startEditLabel:ln,saveLabel:ma,deleteAccount:Gs,startDeviceLogin:va,cancelDeviceLogin:Dn,formatSize:Fe,fetchContextWindows:Qe,clearContextClamp:ki,setContextOverride:Ee,setContextUtilization:Le,resetContextOverride:te,overrideAboveFloor:xe,formatCount:$e,formatContextCeiling:ze,formatExpiry:Ye,shortAccountKey:at,provenanceClass:Q,formatDensity:nt}}},kp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function IS(e){return kp[e]||kp[(e||"").toLowerCase()]||"text-gray-400"}const OS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=z(()=>{var w;return Object.values(((w=i.value)==null?void 0:w.totals)||{}).reduce((C,S)=>C+Number(S||0),0)}),u=f(""),p=f(0),h=f([]),m=z(()=>h.value.map(w=>`${w.label} (${w.path}${w.reason?`: ${w.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let k=null;async function A(){var O;const w=await Promise.allSettled(v.map($=>B.get($.path))),C=$=>w[$].status==="fulfilled"?w[$].value:null;t.value=C(0)||{};const S=C(1);s.value=Array.isArray(S)?S:S&&S.subsystems||[],a.value=C(2)||{},n.value=C(3)||{},i.value=C(4),l.value=C(5),o.value=C(6),r.value=C(7),c.value=C(8);const x=w.filter($=>$.status==="rejected");if(h.value=w.flatMap(($,E)=>{var M;return $.status==="rejected"?[{...v[E],reason:((M=$.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===w.length){const $=(O=x[0])==null?void 0:O.reason;u.value=($==null?void 0:$.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",A()}let g=!1;function b(){g||(g=!0,A(),k||(k=setInterval(A,3e4)))}function _(){g&&(g=!1,k&&(clearInterval(k),k=null))}return Ge(b),es(b),Wt(_),ft(_),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:IS,formatAgeSeconds:Zw}}},LS=1e4,Sp=3e4;function Oi(e,t){return Math.max(0,e-t)}function Nr(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const NS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],DS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const L=++p;a.value=!0;try{const N=await B.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=N.availability,e.value=N.availability==="available"?N.data:null,s.value=null,n.value=Date.now()}catch(N){if(L!==p)return;s.value=N.message||"Turn-state read failed",N.status===503&&(t.value="unavailable")}L===p&&(a.value=!1)}async function v(){const L=++h;r.value=!0;try{const N=await B.get("/api/turn-state/capacity-breakers");if(L!==h)return;l.value=N.availability,i.value=N.availability==="available"?N.data:null,o.value=null,c.value=Date.now()}catch(N){if(L!==h)return;o.value=N.message||"Breaker read failed",N.status===503&&(l.value="unavailable")}L===h&&(r.value=!1)}function k(){m(),v()}const A=z(()=>e.value!==null&&Oi(d.value,n.value)>Sp),y=z(()=>i.value!==null&&Oi(d.value,c.value)>Sp),g=z(()=>A.value||y.value),b=z(()=>Math.round(Oi(d.value,n.value)/1e3)),_=z(()=>Math.round(Oi(d.value,c.value)/1e3));function w(L){return Nr(L,d.value/1e3)}function C(L){return NS[w(L)]}const S=z(()=>{var ne;const L=[...((ne=e.value)==null?void 0:ne.turns)||[]],N=d.value/1e3;return L.sort((le,U)=>Nr(le,N)-Nr(U,N)||(U.last_progress_at||0)-(le.last_progress_at||0))});function x(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function O(L){if(L.state==="closed")return"—";const N=Oi(d.value,c.value)/1e3,ne=Math.max(0,(L.cooldown_remaining_seconds||0)-N);return ne>0?`${Math.ceil(ne)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function $(L){if(!L)return"";const N=Math.max(0,Math.round(d.value/1e3-L));if(N<90)return`${N}s ago`;const ne=Math.round(N/60);return ne<90?`${ne}m ago`:`${Math.round(ne/60)}h ago`}let E=null,M=null,V=!1;function G(){V||(V=!0,k(),E=setInterval(k,LS),u=setInterval(()=>{d.value=Date.now()},1e3),M=st.onReconnected(k))}function P(){V&&(V=!1,E&&(clearInterval(E),E=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return Ge(G),es(G),Wt(P),ft(P),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:A,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:_,sortedTurns:S,priorityOf:w,priorityBadge:C,breakerBadge:x,cooldownLabel:O,ageLabel:$,fetchTurns:m,fetchBreakers:v,refreshAll:k,arm:G,disarm:P}}},PS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await B.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Kt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await B.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Tp=e=>JSON.parse(JSON.stringify(e)),MS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),FS={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(P,L)=>p&&h===P&&B.token===L,k=P=>"computer-provisioning-"+P.key,A=P=>P===null?"Unset":P===""?"Empty":JSON.stringify(P),y=P=>{const L=n.value[P.key];return P.type==="array"?String(L||"").split(/\r?\n/).map(N=>N.trim()).filter(Boolean):["integer","number"].includes(P.type)?L===""||L==null?null:Number(L):L},g=z(()=>s.value.map(P=>({...P,value:y(P)})).filter(P=>!MS(P.value,a.value[P.key]))),b=z(()=>s.value.filter(P=>P.pending_restart).map(P=>P.label)),_=z(()=>s.value.some(P=>P.apply_state==="unknown")),w=z(()=>{const P={};for(const L of s.value){const N=y(L),ne=L.constraints||{};["integer","number"].includes(L.type)&&(N===null&&!L.nullable?P[L.key]="A number is required.":N!==null&&(!Number.isFinite(N)||L.type==="integer"&&!Number.isInteger(N)||ne.minimum!=null&&N<ne.minimum||ne.maximum!=null&&N>ne.maximum)&&(P[L.key]="Enter a number within the allowed range.")),L.key==="monitor_names"&&(N.length>16||new Set(N).size!==N.length||N.some(le=>!/^[A-Za-z0-9_.-]{1,64}$/.test(le)))&&(P[L.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return P}),C=z(()=>Object.keys(w.value).length>0);function S(P,L){n.value[P.key]=L,u.value=""}function x(){n.value=Object.fromEntries(s.value.map(P=>[P.key,P.type==="array"?a.value[P.key].join(`
`):a.value[P.key]])),r.value=!1}async function O(P,L){const[N,ne]=await Promise.all([B.get("/api/config"),B.get("/api/config/meta")]);if(!v(P,L))return!1;const le=(ne.fields||[]).filter(U=>/^computer\.[^.]+$/.test(U.path)&&U.path!=="computer.enabled"&&U.sensitivity==="public"&&U.apply_mode==="restart");if(!N.computer||!le.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=le.map(U=>({...U,key:U.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(U=>[U.key,Tp(N.computer[U.key])])),x(),m=L,i.value=!0,c.value=!1,!0}async function $(){if(!p||l.value||o.value)return;const P=++h,L=B.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await O(P,L)}catch(N){v(P,L)&&(c.value=!0,d.value=N.message||"Could not load provisioning. No changes were sent.")}finally{v(P,L)&&(l.value=!1)}}function E(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!C.value&&(r.value=!0)}async function M(){if(!p||!i.value||!r.value||o.value||l.value||c.value||C.value||!g.value.length)return;if(m!==B.token){G(),V();return}const P={computer:Object.fromEntries(g.value.map(le=>[le.key,Tp(le.value)]))},L=h,N=B.token;o.value=!0,d.value="",u.value="";let ne=!1;try{if(await B.put("/api/config",P),ne=!0,!v(L,N))return;await O(L,N)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(le){v(L,N)&&(c.value=!0,r.value=!1,d.value=ne?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${le.status===400?": "+le.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(L,N)&&(o.value=!1)}}function V(){p||(p=!0,$())}function G(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(V),es(V),Wt(G),ft(G),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:_,changes:g,validation:w,invalid:C,fieldId:k,format:A,edit:S,discard:x,load:$,openReview:E,save:M}}},$S={components:{ComputerProvisioning:FS},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),v=f(""),k=f(!1),A=f(Date.now()),y=f(""),g=f(null);let b=0,_=null,w=!1,C=B.token,S=0,x=null,O=null,$=!1;const E=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",M=z(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),V=z(()=>{var ee;const H=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(H)&&A.value-H<15e3&&A.value>=H-5e3}),G=z(()=>{var H;return V.value?E((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),P=z(()=>{var H;return V.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),L=z(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,ee])=>`${H}: ${ee}`).join(", ")),N=z(()=>{var ee;const H=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),ne=z(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),le=z(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),U=z(()=>{var ee,X;const H=Date.parse(((ee=m.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(H)&&A.value<H+Math.min(1e4,((X=m.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function K(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function oe(){b++,K(),g.value=null,c.value=!1,x==null||x.abort(),x=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function W(H,ee){return w&&H===b&&ee===B.token}function ue(){return w&&c.value&&O===B.token&&Date.now()-u.value<15e3}function de(H,ee="mutation"){var he,fe;oe(),$=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,O=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(X)&&typeof((he=H.data)==null?void 0:he.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((fe=H.data)==null?void 0:fe.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function q(){if(t.value||r.value||a.value||n.value||d.value||!w)return;const H=b,ee=B.token;t.value=!0,S=Date.now();const X=new AbortController;x=X;try{const he=await B.get("/api/computer",{signal:X.signal});if(!W(H,ee))return;ce(he)}catch(he){W(H,ee)&&de(he,"read")}finally{x===X&&(x=null,t.value=!1)}}function ce(H,ee=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&oe(),e.value=H,u.value=Date.now(),O=B.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",$=!c.value}async function pe(H){if(!ue()||r.value||a.value||n.value||d.value)return;oe();const ee=b,X=B.token;r.value=!0;let he=!1;try{if(await B.post("/api/computer/enabled",{enabled:H}),he=!0,!W(ee,X))return;const fe=await B.get("/api/computer");W(ee,X)&&ce(fe,"toggle")}catch(fe){W(ee,X)&&de(fe,he?"acknowledged":"mutation")}finally{r.value=!1}}async function me(H){if(!w||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;oe();const ee=b,X=B.token,he=H==="stop"?a:n;he.value=!0;let fe=!1;try{if(await B.post("/api/computer/"+H,{}),fe=!0,W(ee,X)){const ye=await B.get("/api/computer");W(ee,X)&&ce(ye,H)}}catch(ye){W(ee,X)&&de(ye,fe?"acknowledged":"mutation")}finally{he.value=!1}}async function _e(){var he;if(!ue()||d.value||((he=e.value.backend)==null?void 0:he.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;oe();const ee=b,X=B.token;d.value=!0;try{const fe=await B.post("/api/computer/release_owned_input",H);W(ee,X)&&ce(fe,"recovery")}catch(fe){W(ee,X)&&de(fe,"mutation")}finally{d.value=!1}}async function Me(){return F(!1)}async function T(){return F(!0)}async function F(H){var Oe;if(!ue()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(H){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=h.value}const X=H?((Oe=e.value.recovery)==null?void 0:Oe.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";oe();const he=b,fe=B.token;d.value=!0;let ye=!1;try{const ge=await B.post("/api/computer/"+X,ee);ye=!0,W(he,fe)&&ce(ge,"recovery")}catch(ge){W(he,fe)&&de(ge,ye?"acknowledged":"mutation")}finally{d.value=!1}}async function I(){var X;if(!ue()||s.value||!e.value.available)return;K(),k.value=!1;const H=b,ee=B.token;s.value=!0;try{const he=await B.post("/api/computer/observe",{});if(!W(H,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=he.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const fe=await B.getBlob("/api/computer/evidence/"+he.frame.evidence_id);if(!W(H,ee))return;if(!["image/png","image/jpeg"].includes(fe.type)||fe.size>2097152||!Number.isFinite(Date.parse(he.frame.expires_at))||Date.parse(he.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=he.frame,v.value=URL.createObjectURL(fe),o.value=""}catch(he){W(H,ee)&&de(he)}finally{H===b&&(s.value=!1)}}async function Z(){if(!ue()||i.value||!e.value.available)return;g.value=null;const H=b,ee=B.token;i.value=!0;try{const X=await B.post("/api/computer/export",{name:y.value});W(H,ee)&&(g.value=X,o.value="")}catch(X){W(H,ee)&&de(X)}finally{H===b&&(i.value=!1)}}async function Y(){if(!ue()||l.value||!g.value)return;const H=b,ee=B.token,X=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const he=await B.getBlob("/api/computer/download/"+X.artifact_id);if(!W(H,ee))return;const fe=URL.createObjectURL(he),ye=document.createElement("a");ye.href=fe,ye.download=X.name,ye.click(),setTimeout(()=>URL.revokeObjectURL(fe),1e3)}catch(he){W(H,ee)&&de(he)}finally{H===b&&(l.value=!1)}}function ae(){w||(C!==B.token&&(C=B.token,oe(),u.value=0,O=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),w=!0,q(),_=setInterval(()=>{A.value=Date.now(),C!==B.token&&(C=B.token,oe(),u.value=0,O=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&A.value-u.value>=15e3&&oe(),m.value&&Date.parse(m.value.expires_at)<=A.value&&(K(),k.value=!0),g.value&&Date.parse(g.value.expires_at)<=A.value&&(g.value=null),!$&&A.value-S>=5e3&&q()},500))}function ve(){w=!1,clearInterval(_),_=null,oe(),c.value=!1}return Ge(ae),es(ae),Wt(ve),ft(ve),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:k,freshness:U,name:y,artifact:g,refresh:q,control:me,observe:I,clearFrame:K,exportFile:Z,download:Y,toggling:r,adminReady:c,enabledLabel:E,restartSettings:le,setEnabled:pe,recovering:d,recover:Me,reconcile:T,releaseOwnedInput:_e,reconciliationAck:h,applicationProfiles:ne,attached:M,scriptIdentity:N,inputLimits:L,accessibilityLabel:G,accessibilityDetail:P}}},gv=[{id:"health",label:"Health",component:jk},{id:"resources",label:"Resources",component:Vk},{id:"logs",label:"Logs",component:sS},{id:"config",label:"Config",component:hS},{id:"discord",label:"Discord",component:vS},{id:"hosts",label:"Hosts",component:yS},{id:"host-access",label:"Host Access",component:bS},{id:"api-tokens",label:"API Tokens",component:xS},{id:"llm",label:"LLM Config",component:RS},{id:"internals",label:"Internals",component:OS},{id:"turn-state",label:"Turn State",component:DS},{id:"computer",label:"Computer",component:$S},{id:"update",label:"Update",component:PS}],US={components:{TabbedPage:or},setup(){return{tabs:gv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Gl=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),BS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Gl("Operations","operations","/operations",ov),...Gl("History","history","/history",rv),...Gl("Capabilities","capabilities","/capabilities",cv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Gl("System","system","/system",gv)],_s=an({open:!1,query:"",selected:0});function Cp(){_s.query="",_s.selected=0,_s.open=!0}function Dr(){_s.open=!1}function HS(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const zS={setup(){const e=Xm(),t=f(null),s=z(()=>{const i=_s.query.trim().toLowerCase();return BS.map(l=>({...l,_score:HS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ut(()=>_s.open,async i=>{var l;i&&(await Ot(),(l=t.value)==null||l.focus())}),Ut(()=>_s.query,()=>{_s.selected=0});function a(i){Dr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Dr();return}if(i.key==="ArrowDown")i.preventDefault(),_s.selected=Math.min(_s.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),_s.selected=Math.max(_s.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[_s.selected];l&&a(l)}}return{state:_s,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Dr}},template:`
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
  `},_c={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(_c));const jS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ci("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ci("path",{d:_c[e.name]||_c.info})])}},VS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Ep(e){return[...e.querySelectorAll(VS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const qS={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Ep(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Ep(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},GS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=z(()=>{const le=e.value.uptime_seconds||0,U=Math.floor(le/86400),K=Math.floor(le%86400/3600),oe=Math.floor(le%3600/60),W=[];return U>0&&W.push(`${U}d`),K>0&&W.push(`${K}h`),(W.length===0||U===0&&K===0)&&W.push(`${oe}m`),W.join(" ")}),m=z(()=>{const le=e.value.uptime_seconds||0;return 125.66*(1-Math.min(le/86400,1))}),v=z(()=>{const le=e.value;return[{label:"Guilds",value:le.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:le.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:le.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${le.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:le.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:le.loop_count>0?"text-green-400":"",highlight:le.loop_count>0},{label:"Agents",value:le.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:le.agent_count>0?`${le.agent_count} total`:"",subColor:"text-gray-500",highlight:(le.agent_running??0)>0},{label:"Processes",value:le.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:le.process_count>0?`${le.process_count} total`:"",subColor:"text-gray-500",highlight:(le.process_running??0)>0},{label:"Schedules",value:le.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(le.schedule_failing>0?`${le.schedule_failing} failing`:"")+(le.schedule_failing>0&&le.schedule_paused>0?", ":"")+(le.schedule_paused>0?`${le.schedule_paused} paused`:"")||void 0,subColor:le.schedule_failing>0?"text-red-400":"text-yellow-400",color:le.schedule_failing>0?"text-red-400":"",highlight:le.schedule_failing>0},{label:"Users",value:le.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),k=z(()=>{const le=e.value,U=[];return U.push({label:"Bot",status:le.status==="online"?"ok":"warn",detail:le.status==="online"?"Online":"Starting"}),(le.schedule_failing||0)>0?U.push({label:"Schedules",status:"error",detail:`${le.schedule_failing} failing`}):(le.schedule_count||0)>0&&U.push({label:"Schedules",status:"ok",detail:`${le.schedule_count} configured`}),(le.loop_count||0)>0&&U.push({label:"Loops",status:"ok",detail:`${le.loop_count} active`}),(le.agent_running||0)>0&&U.push({label:"Agents",status:"ok",detail:`${le.agent_running} running`}),(le.process_running||0)>0&&U.push({label:"Processes",status:"ok",detail:`${le.process_running} running`}),U});async function A(){try{e.value=await B.get("/api/status"),s.value=null}catch(le){s.value=le.message}finally{t.value=!1}}let y=0,g=0,b=0,_=0;function w(le,U){const K=new Set;return[...U,...le].filter(oe=>{const W=oe._hmac||JSON.stringify([oe.timestamp,oe.tool_name,oe.user_id,oe.result_summary,oe.error]);return K.has(W)?!1:(K.add(W),!0)})}async function C(){const le=++y,U=b;n.value=!0;try{const K=await B.get("/api/audit?limit=10");if(le!==y)return;const oe=U===b?[]:a.value.filter(W=>(W._liveEpoch||0)>U);a.value=w(K,oe).slice(0,10),c.value=oe.length}catch{}le===y&&(n.value=!1)}async function S(){const le=++g,U=_;l.value=!0;try{const K=await B.get("/api/audit?error_only=1&limit=5");if(le!==g)return;const oe=U===_?[]:i.value.filter(W=>(W._liveErrorEpoch||0)>U);i.value=w(K,oe).slice(0,5),o.value=!1}catch{if(le!==g)return;o.value=U===_||i.value.length===0}le===g&&(l.value=!1)}async function x(){try{const le=await B.get("/api/knowledge");d.value=(Array.isArray(le)?le:[]).reduce((U,K)=>U+(K.chunks||0),0)}catch{d.value=null}}async function O(){try{const le=await B.get("/api/agents");r.value=le.filter(U=>U.status==="running")}catch{}}async function $(){u.value={...u.value,reload:!0};try{await B.post("/api/reload"),we.success("Config reloaded")}catch(le){we.error(le.message)}u.value={...u.value,reload:!1}}async function E(){if(!await Kt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const U=e.value.session_count;e.value={...e.value,session_count:0};try{const K=await B.post("/api/sessions/clear-all");we.success(`Cleared ${K.count} session${K.count!==1?"s":""}`),await A()}catch(K){e.value={...e.value,session_count:U},we.error(K.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await Kt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const U=e.value.loop_count;e.value={...e.value,loop_count:0};try{const K=await B.post("/api/loops/stop-all");we.success(K.result),await A()}catch(K){e.value={...e.value,loop_count:U},we.error(K.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,A(),C(),S(),O()}let G=null,P=null,L=null;function N(le){if(le.payload&&le.payload.tool_name){b+=1;const U={...le.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(U),a.value.length>10&&a.value.pop(),c.value++,U.error&&(_+=1,U._liveErrorEpoch=_,o.value=!1,i.value.unshift(U),i.value.length>5&&i.value.pop()),setTimeout(()=>{U._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let ne=null;return Ge(async()=>{await Promise.all([A(),C(),S(),O(),x()]),G=setInterval(A,15e3),P=setInterval(O,1e4),st.subscribe("events",N),ne=st.onReconnected(()=>{C(),S()})}),ft(()=>{G&&clearInterval(G),P&&clearInterval(P),clearTimeout(L),st.unsubscribe("events",N),ne&&(ne(),ne=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:k,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:C,fetchErrors:S,fetchStatus:A,onEvent:N,formatTime:Jw,formatDuration:bi,retry:V,reloadConfig:$,clearSessions:E,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ap(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function KS(e){if(Array.isArray(e))return e}function WS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function JS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ZS(e,t){return KS(e)||WS(e,t)||YS(e,t)||JS()}function YS(e,t){if(e){if(typeof e=="string")return Ap(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ap(e,t):void 0}}const bv=Object.entries,Rp=Object.setPrototypeOf,QS=Object.isFrozen,XS=Object.getPrototypeOf,e1=Object.getOwnPropertyDescriptor;let hs=Object.freeze,js=Object.seal,Kn=Object.create,yv=typeof Reflect<"u"&&Reflect,wc=yv.apply,kc=yv.construct;hs||(hs=function(t){return t});js||(js=function(t){return t});wc||(wc=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});kc||(kc=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const _a=Bt(Array.prototype.forEach),t1=Bt(Array.prototype.lastIndexOf),Ip=Bt(Array.prototype.pop),zn=Bt(Array.prototype.push),s1=Bt(Array.prototype.splice),cs=Array.isArray,Ui=Bt(String.prototype.toLowerCase),Pr=Bt(String.prototype.toString),Op=Bt(String.prototype.match),jn=Bt(String.prototype.replace),Lp=Bt(String.prototype.indexOf),a1=Bt(String.prototype.trim),n1=Bt(Number.prototype.toString),i1=Bt(Boolean.prototype.toString),Np=typeof BigInt>"u"?null:Bt(BigInt.prototype.toString),Dp=typeof Symbol>"u"?null:Bt(Symbol.prototype.toString),Ct=Bt(Object.prototype.hasOwnProperty),Li=Bt(Object.prototype.toString),Jt=Bt(RegExp.prototype.test),dn=l1(TypeError);function Bt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return wc(e,t,a)}}function l1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return kc(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ui;if(Rp&&Rp(e,null),!cs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(QS(t)||(t[a]=i),n=i)}e[n]=!0}return e}function o1(e){for(let t=0;t<e.length;t++)Ct(e,t)||(e[t]=null);return e}function ss(e){const t=Kn(null);for(const a of bv(e)){var s=ZS(a,2);const n=s[0],i=s[1];Ct(e,n)&&(cs(i)?t[n]=o1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ss(i):t[n]=i)}return t}function r1(e){switch(typeof e){case"string":return e;case"number":return n1(e);case"boolean":return i1(e);case"bigint":return Np?Np(e):"0";case"symbol":return Dp?Dp(e):"Symbol()";case"undefined":return Li(e);case"function":case"object":{if(e===null)return Li(e);const t=e,s=ia(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Li(a)}return Li(e)}default:return Li(e)}}function ia(e,t){for(;e!==null;){const a=e1(e,t);if(a){if(a.get)return Bt(a.get);if(typeof a.value=="function")return Bt(a.value)}e=XS(e)}function s(){return null}return s}function c1(e){try{return Jt(e,""),!0}catch{return!1}}const Pp=hs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Mr=hs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Fr=hs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),d1=hs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),$r=hs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),u1=hs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Mp=hs(["#text"]),Fp=hs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Ur=hs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),$p=hs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Kl=hs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),p1=js(/{{[\w\W]*|^[\w\W]*}}/g),f1=js(/<%[\w\W]*|^[\w\W]*%>/g),h1=js(/\${[\w\W]*/g),m1=js(/^data-[\-\w.\u00B7-\uFFFF]+$/),v1=js(/^aria-[\-\w]+$/),Up=js(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),g1=js(/^(?:\w+script|data):/i),b1=js(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),y1=js(/^html$/i),x1=js(/^[a-z][.\w]*(-[.\w]+)+$/i),aa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},_1=function(){return typeof window>"u"?null:window},w1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Bp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function xv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:_1();const t=Re=>xv(Re);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==aa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=ia(p,"cloneNode"),m=ia(p,"remove"),v=ia(p,"nextSibling"),k=ia(p,"childNodes"),A=ia(p,"parentNode"),y=ia(p,"shadowRoot"),g=ia(p,"attributes"),b=l&&l.prototype?ia(l.prototype,"nodeType"):null,_=l&&l.prototype?ia(l.prototype,"nodeName"):null;if(typeof i=="function"){const Re=s.createElement("template");Re.content&&Re.content.ownerDocument&&(s=Re.content.ownerDocument)}let w,C="",S,x=!1,O=0;const $=function(){if(O>0)throw dn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},E=function(D){$(),O++;try{return w.createHTML(D)}finally{O--}},M=function(D){$(),O++;try{return w.createScriptURL(D)}finally{O--}},V=function(){return x||(S=w1(u,n),x=!0),S},G=s,P=G.implementation,L=G.createNodeIterator,N=G.createDocumentFragment,ne=G.getElementsByTagName,le=a.importNode;let U=Bp();t.isSupported=typeof bv=="function"&&typeof A=="function"&&P&&P.createHTMLDocument!==void 0;const K=p1,oe=f1,W=h1,ue=m1,de=v1,q=g1,ce=b1,pe=x1;let me=Up,_e=null;const Me=qe({},[...Pp,...Mr,...Fr,...$r,...Mp]);let T=null;const F=qe({},[...Fp,...Ur,...$p,...Kl]);let I=Object.seal(Kn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Z=null,Y=null;const ae=Object.seal(Kn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ve=!0,H=!0,ee=!1,X=!0,he=!1,fe=!0,ye=!1,Oe=!1,ge=!1,Fe=!1,$e=!1,ze=!1,Ye=!0,at=!1;const nt="user-content-";let Q=!0,xe=!1,Ee={},Le=null;const te=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ce=null;const Ne=qe({},["audio","video","img","source","image","track"]);let Qe=null;const Nt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),We="http://www.w3.org/1998/Math/MathML",Dt="http://www.w3.org/2000/svg",Vt="http://www.w3.org/1999/xhtml";let ms=Vt,ea=!1,Cs=null;const nn=qe({},[We,Dt,Vt],Pr);let ta=qe({},["mi","mo","mn","ms","mtext"]),Vs=qe({},["annotation-xml"]);const ha=qe({},["title","style","font","a","script"]);let vs=null;const za=["application/xhtml+xml","text/html"],gs="text/html";let it=null,Pt=null;const Ds=s.createElement("form"),ie=function(D){return D instanceof RegExp||D instanceof Function},Te=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Pt&&Pt===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),vs=za.indexOf(D.PARSER_MEDIA_TYPE)===-1?gs:D.PARSER_MEDIA_TYPE,it=vs==="application/xhtml+xml"?Pr:Ui,_e=Ct(D,"ALLOWED_TAGS")&&cs(D.ALLOWED_TAGS)?qe({},D.ALLOWED_TAGS,it):Me,T=Ct(D,"ALLOWED_ATTR")&&cs(D.ALLOWED_ATTR)?qe({},D.ALLOWED_ATTR,it):F,Cs=Ct(D,"ALLOWED_NAMESPACES")&&cs(D.ALLOWED_NAMESPACES)?qe({},D.ALLOWED_NAMESPACES,Pr):nn,Qe=Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)?qe(ss(Nt),D.ADD_URI_SAFE_ATTR,it):Nt,Ce=Ct(D,"ADD_DATA_URI_TAGS")&&cs(D.ADD_DATA_URI_TAGS)?qe(ss(Ne),D.ADD_DATA_URI_TAGS,it):Ne,Le=Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)?qe({},D.FORBID_CONTENTS,it):te,Z=Ct(D,"FORBID_TAGS")&&cs(D.FORBID_TAGS)?qe({},D.FORBID_TAGS,it):ss({}),Y=Ct(D,"FORBID_ATTR")&&cs(D.FORBID_ATTR)?qe({},D.FORBID_ATTR,it):ss({}),Ee=Ct(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,ve=D.ALLOW_ARIA_ATTR!==!1,H=D.ALLOW_DATA_ATTR!==!1,ee=D.ALLOW_UNKNOWN_PROTOCOLS||!1,X=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,he=D.SAFE_FOR_TEMPLATES||!1,fe=D.SAFE_FOR_XML!==!1,ye=D.WHOLE_DOCUMENT||!1,Fe=D.RETURN_DOM||!1,$e=D.RETURN_DOM_FRAGMENT||!1,ze=D.RETURN_TRUSTED_TYPE||!1,ge=D.FORCE_BODY||!1,Ye=D.SANITIZE_DOM!==!1,at=D.SANITIZE_NAMED_PROPS||!1,Q=D.KEEP_CONTENT!==!1,xe=D.IN_PLACE||!1,me=c1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Up,ms=typeof D.NAMESPACE=="string"?D.NAMESPACE:Vt,ta=Ct(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),Vs=Ct(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const re=Ct(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Kn(null);if(I=Kn(null),Ct(re,"tagNameCheck")&&ie(re.tagNameCheck)&&(I.tagNameCheck=re.tagNameCheck),Ct(re,"attributeNameCheck")&&ie(re.attributeNameCheck)&&(I.attributeNameCheck=re.attributeNameCheck),Ct(re,"allowCustomizedBuiltInElements")&&typeof re.allowCustomizedBuiltInElements=="boolean"&&(I.allowCustomizedBuiltInElements=re.allowCustomizedBuiltInElements),he&&(H=!1),$e&&(Fe=!0),Ee&&(_e=qe({},Mp),T=Kn(null),Ee.html===!0&&(qe(_e,Pp),qe(T,Fp)),Ee.svg===!0&&(qe(_e,Mr),qe(T,Ur),qe(T,Kl)),Ee.svgFilters===!0&&(qe(_e,Fr),qe(T,Ur),qe(T,Kl)),Ee.mathMl===!0&&(qe(_e,$r),qe(T,$p),qe(T,Kl))),ae.tagCheck=null,ae.attributeCheck=null,Ct(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?ae.tagCheck=D.ADD_TAGS:cs(D.ADD_TAGS)&&(_e===Me&&(_e=ss(_e)),qe(_e,D.ADD_TAGS,it))),Ct(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?ae.attributeCheck=D.ADD_ATTR:cs(D.ADD_ATTR)&&(T===F&&(T=ss(T)),qe(T,D.ADD_ATTR,it))),Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)&&qe(Qe,D.ADD_URI_SAFE_ATTR,it),Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)&&(Le===te&&(Le=ss(Le)),qe(Le,D.FORBID_CONTENTS,it)),Ct(D,"ADD_FORBID_CONTENTS")&&cs(D.ADD_FORBID_CONTENTS)&&(Le===te&&(Le=ss(Le)),qe(Le,D.ADD_FORBID_CONTENTS,it)),Q&&(_e["#text"]=!0),ye&&qe(_e,["html","head","body"]),_e.table&&(qe(_e,["tbody"]),delete Z.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const be=w;w=D.TRUSTED_TYPES_POLICY;try{C=E("")}catch(De){throw w=be,De}}else D.TRUSTED_TYPES_POLICY===null?(w=void 0,C=""):(w===void 0&&(w=V()),w&&typeof C=="string"&&(C=E("")));(U.uponSanitizeElement.length>0||U.uponSanitizeAttribute.length>0)&&_e===Me&&(_e=ss(_e)),U.uponSanitizeAttribute.length>0&&T===F&&(T=ss(T)),hs&&hs(D),Pt=D},Ue=qe({},[...Mr,...Fr,...d1]),et=qe({},[...$r,...u1]),kt=function(D){let re=A(D);(!re||!re.tagName)&&(re={namespaceURI:ms,tagName:"template"});const be=Ui(D.tagName),De=Ui(re.tagName);return Cs[D.namespaceURI]?D.namespaceURI===Dt?re.namespaceURI===Vt?be==="svg":re.namespaceURI===We?be==="svg"&&(De==="annotation-xml"||ta[De]):!!Ue[be]:D.namespaceURI===We?re.namespaceURI===Vt?be==="math":re.namespaceURI===Dt?be==="math"&&Vs[De]:!!et[be]:D.namespaceURI===Vt?re.namespaceURI===Dt&&!Vs[De]||re.namespaceURI===We&&!ta[De]?!1:!et[be]&&(ha[be]||!Ue[be]):!!(vs==="application/xhtml+xml"&&Cs[D.namespaceURI]):!1},ht=function(D){zn(t.removed,{element:D});try{A(D).removeChild(D)}catch{if(m(D),!A(D))throw dn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ja=function(D){const re=k?k(D):D.childNodes;if(re){const De=[];_a(re,Be=>{zn(De,Be)}),_a(De,Be=>{try{m(Be)}catch{}})}const be=g?g(D):null;if(be)for(let De=be.length-1;De>=0;--De){const Be=be[De],je=Be&&Be.name;if(typeof je=="string")try{D.removeAttribute(je)}catch{}}},qs=function(D,re){try{zn(t.removed,{attribute:re.getAttributeNode(D),from:re})}catch{zn(t.removed,{attribute:null,from:re})}if(re.removeAttribute(D),D==="is")if(Fe||$e)try{ht(re)}catch{}else try{re.setAttribute(D,"")}catch{}},wi=function(D){const re=g?g(D):D.attributes;if(re)for(let be=re.length-1;be>=0;--be){const De=re[be],Be=De&&De.name;if(!(typeof Be!="string"||T[it(Be)]))try{D.removeAttribute(Be)}catch{}}},ki=function(D){const re=[D];for(;re.length>0;){const be=re.pop();(b?b(be):be.nodeType)===aa.element&&wi(be);const Be=k?k(be):be.childNodes;if(Be)for(let je=Be.length-1;je>=0;--je)re.push(Be[je])}},Ln=function(D){let re=null,be=null;if(ge)D="<remove></remove>"+D;else{const je=Op(D,/^[\r\n\t ]+/);be=je&&je[0]}vs==="application/xhtml+xml"&&ms===Vt&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const De=w?E(D):D;if(ms===Vt)try{re=new d().parseFromString(De,vs)}catch{}if(!re||!re.documentElement){re=P.createDocument(ms,"template",null);try{re.documentElement.innerHTML=ea?C:De}catch{}}const Be=re.body||re.documentElement;return D&&be&&Be.insertBefore(s.createTextNode(be),Be.childNodes[0]||null),ms===Vt?ne.call(re,ye?"html":"body")[0]:ye?re.documentElement:Be},Nn=function(D){return L.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ln=function(D){var re,be;D.normalize();const De=L.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Be=De.nextNode();for(;Be;){let Rt=Be.data;_a([K,oe,W],dt=>{Rt=jn(Rt,dt," ")}),Be.data=Rt,Be=De.nextNode()}const je=(re=(be=D.querySelectorAll)===null||be===void 0?void 0:be.call(D,"template"))!==null&&re!==void 0?re:[];_a(Array.from(je),Rt=>{Gs(Rt.content)&&ln(Rt.content)})},ma=function(D){const re=_?_(D):null;return typeof re!="string"||it(re)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==k(D)},Gs=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===aa.documentFragment}catch{return!1}},va=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function Es(Re,D,re){_a(Re,be=>{be.call(t,D,re,Pt)})}const Dn=function(D){let re=null;if(Es(U.beforeSanitizeElements,D,null),ma(D))return ht(D),!0;const be=it(_?_(D):D.nodeName);if(Es(U.uponSanitizeElement,D,{tagName:be,allowedTags:_e}),fe&&D.hasChildNodes()&&!va(D.firstElementChild)&&Jt(/<[/\w!]/g,D.innerHTML)&&Jt(/<[/\w!]/g,D.textContent)||fe&&D.namespaceURI===Vt&&be==="style"&&va(D.firstElementChild)||D.nodeType===aa.progressingInstruction||fe&&D.nodeType===aa.comment&&Jt(/<[/\w]/g,D.data))return ht(D),!0;if(Z[be]||!(ae.tagCheck instanceof Function&&ae.tagCheck(be))&&!_e[be]){if(!Z[be]&&Ae(be)&&(I.tagNameCheck instanceof RegExp&&Jt(I.tagNameCheck,be)||I.tagNameCheck instanceof Function&&I.tagNameCheck(be)))return!1;if(Q&&!Le[be]){const Be=A(D),je=k(D);if(je&&Be){const Rt=je.length;for(let dt=Rt-1;dt>=0;--dt){const bt=xe?je[dt]:h(je[dt],!0);Be.insertBefore(bt,v(D))}}}return ht(D),!0}return(b?b(D):D.nodeType)===aa.element&&!kt(D)||(be==="noscript"||be==="noembed"||be==="noframes")&&Jt(/<\/no(script|embed|frames)/i,D.innerHTML)?(ht(D),!0):(he&&D.nodeType===aa.text&&(re=D.textContent,_a([K,oe,W],Be=>{re=jn(re,Be," ")}),D.textContent!==re&&(zn(t.removed,{element:D.cloneNode()}),D.textContent=re)),Es(U.afterSanitizeElements,D,null),!1)},J=function(D,re,be){if(Y[re]||Ye&&(re==="id"||re==="name")&&(be in s||be in Ds))return!1;const De=T[re]||ae.attributeCheck instanceof Function&&ae.attributeCheck(re,D);if(!(H&&!Y[re]&&Jt(ue,re))){if(!(ve&&Jt(de,re))){if(!De||Y[re]){if(!(Ae(D)&&(I.tagNameCheck instanceof RegExp&&Jt(I.tagNameCheck,D)||I.tagNameCheck instanceof Function&&I.tagNameCheck(D))&&(I.attributeNameCheck instanceof RegExp&&Jt(I.attributeNameCheck,re)||I.attributeNameCheck instanceof Function&&I.attributeNameCheck(re,D))||re==="is"&&I.allowCustomizedBuiltInElements&&(I.tagNameCheck instanceof RegExp&&Jt(I.tagNameCheck,be)||I.tagNameCheck instanceof Function&&I.tagNameCheck(be))))return!1}else if(!Qe[re]){if(!Jt(me,jn(be,ce,""))){if(!((re==="src"||re==="xlink:href"||re==="href")&&D!=="script"&&Lp(be,"data:")===0&&Ce[D])){if(!(ee&&!Jt(q,jn(be,ce,"")))){if(be)return!1}}}}}}return!0},ke=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ae=function(D){return!ke[Ui(D)]&&Jt(pe,D)},Ks=function(D){Es(U.beforeSanitizeAttributes,D,null);const re=D.attributes;if(!re||ma(D))return;const be={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:T,forceKeepAttr:void 0};let De=re.length;for(;De--;){const Be=re[De],je=Be.name,Rt=Be.namespaceURI,dt=Be.value,bt=it(je),Ps=dt;let wt=je==="value"?Ps:a1(Ps);if(be.attrName=bt,be.attrValue=wt,be.keepAttr=!0,be.forceKeepAttr=void 0,Es(U.uponSanitizeAttribute,D,be),wt=be.attrValue,at&&(bt==="id"||bt==="name")&&Lp(wt,nt)!==0&&(qs(je,D),wt=nt+wt),fe&&Jt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,wt)){qs(je,D);continue}if(bt==="attributename"&&Op(wt,"href")){qs(je,D);continue}if(be.forceKeepAttr)continue;if(!be.keepAttr){qs(je,D);continue}if(!X&&Jt(/\/>/i,wt)){qs(je,D);continue}he&&_a([K,oe,W],Mn=>{wt=jn(wt,Mn," ")});const Pn=it(D.nodeName);if(!J(Pn,bt,wt)){qs(je,D);continue}if(w&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Rt)switch(u.getAttributeType(Pn,bt)){case"TrustedHTML":{wt=E(wt);break}case"TrustedScriptURL":{wt=M(wt);break}}if(wt!==Ps)try{Rt?D.setAttributeNS(Rt,je,wt):D.setAttribute(je,wt),ma(D)?ht(D):Ip(t.removed)}catch{qs(je,D)}}Es(U.afterSanitizeAttributes,D,null)},ga=function(D){let re=null;const be=Nn(D);for(Es(U.beforeSanitizeShadowDOM,D,null);re=be.nextNode();)if(Es(U.uponSanitizeShadowNode,re,null),Dn(re),Ks(re),Gs(re.content)&&ga(re.content),(b?b(re):re.nodeType)===aa.element){const Be=y?y(re):re.shadowRoot;Gs(Be)&&(bs(Be),ga(Be))}Es(U.afterSanitizeShadowDOM,D,null)},bs=function(D){const re=[{node:D,shadow:null}];for(;re.length>0;){const be=re.pop();if(be.shadow){ga(be.shadow);continue}const De=be.node,je=(b?b(De):De.nodeType)===aa.element,Rt=k?k(De):De.childNodes;if(Rt)for(let dt=Rt.length-1;dt>=0;--dt)re.push({node:Rt[dt],shadow:null});if(je){const dt=_?_(De):null;if(typeof dt=="string"&&it(dt)==="template"){const bt=De.content;Gs(bt)&&re.push({node:bt,shadow:null})}}if(je){const dt=y?y(De):De.shadowRoot;Gs(dt)&&re.push({node:null,shadow:dt},{node:dt,shadow:null})}}};return t.sanitize=function(Re){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},re=null,be=null,De=null,Be=null;if(ea=!Re,ea&&(Re="<!-->"),typeof Re!="string"&&!va(Re)&&(Re=r1(Re),typeof Re!="string"))throw dn("dirty is not a string, aborting");if(!t.isSupported)return Re;Oe||Te(D),t.removed=[];const je=xe&&typeof Re!="string"&&va(Re);if(je){const bt=_?_(Re):Re.nodeName;if(typeof bt=="string"){const Ps=it(bt);if(!_e[Ps]||Z[Ps])throw dn("root node is forbidden and cannot be sanitized in-place")}if(ma(Re))throw dn("root node is clobbered and cannot be sanitized in-place");try{bs(Re)}catch(Ps){throw ja(Re),Ps}}else if(va(Re))re=Ln("<!---->"),be=re.ownerDocument.importNode(Re,!0),be.nodeType===aa.element&&be.nodeName==="BODY"||be.nodeName==="HTML"?re=be:re.appendChild(be),bs(be);else{if(!Fe&&!he&&!ye&&Re.indexOf("<")===-1)return w&&ze?E(Re):Re;if(re=Ln(Re),!re)return Fe?null:ze?C:""}re&&ge&&ht(re.firstChild);const Rt=Nn(je?Re:re);try{for(;De=Rt.nextNode();)Dn(De),Ks(De),Gs(De.content)&&ga(De.content)}catch(bt){throw je&&ja(Re),bt}if(je)return _a(t.removed,bt=>{bt.element&&ki(bt.element)}),he&&ln(Re),Re;if(Fe){if(he&&ln(re),$e)for(Be=N.call(re.ownerDocument);re.firstChild;)Be.appendChild(re.firstChild);else Be=re;return(T.shadowroot||T.shadowrootmode)&&(Be=le.call(a,Be,!0)),Be}let dt=ye?re.outerHTML:re.innerHTML;return ye&&_e["!doctype"]&&re.ownerDocument&&re.ownerDocument.doctype&&re.ownerDocument.doctype.name&&Jt(y1,re.ownerDocument.doctype.name)&&(dt="<!DOCTYPE "+re.ownerDocument.doctype.name+`>
`+dt),he&&_a([K,oe,W],bt=>{dt=jn(dt,bt," ")}),w&&ze?E(dt):dt},t.setConfig=function(){let Re=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Re),Oe=!0},t.clearConfig=function(){Pt=null,Oe=!1,w=S,C=""},t.isValidAttribute=function(Re,D,re){Pt||Te({});const be=it(Re),De=it(D);return J(be,De,re)},t.addHook=function(Re,D){typeof D=="function"&&zn(U[Re],D)},t.removeHook=function(Re,D){if(D!==void 0){const re=t1(U[Re],D);return re===-1?void 0:s1(U[Re],re,1)[0]}return Ip(U[Re])},t.removeHooks=function(Re){U[Re]=[]},t.removeAllHooks=function(){U=Bp()},t}var Hp=xv();function Rd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var On=Rd();function _v(e){On=e}var Wi={exec:()=>null};function pt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ps.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var ps={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},k1=/^(?:[ \t]*(?:\n|$))+/,S1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,T1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,El=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,C1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Id=/(?:[*+-]|\d{1,9}[.)])/,wv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,kv=pt(wv).replace(/bull/g,Id).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),E1=pt(wv).replace(/bull/g,Id).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Od=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,A1=/^[^\n]+/,Ld=/(?!\s*\])(?:\\.|[^\[\]\\])+/,R1=pt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Ld).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),I1=pt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Id).getRegex(),dr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Nd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,O1=pt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Nd).replace("tag",dr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Sv=pt(Od).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex(),L1=pt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Sv).getRegex(),Dd={blockquote:L1,code:S1,def:R1,fences:T1,heading:C1,hr:El,html:O1,lheading:kv,list:I1,newline:k1,paragraph:Sv,table:Wi,text:A1},zp=pt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex(),N1={...Dd,lheading:E1,table:zp,paragraph:pt(Od).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",zp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex()},D1={...Dd,html:pt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Nd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Wi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:pt(Od).replace("hr",El).replace("heading",` *#{1,6} *[^
]`).replace("lheading",kv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},P1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,M1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Tv=/^( {2,}|\\)\n(?!\s*$)/,F1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,ur=/[\p{P}\p{S}]/u,Pd=/[\s\p{P}\p{S}]/u,Cv=/[^\s\p{P}\p{S}]/u,$1=pt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Pd).getRegex(),Ev=/(?!~)[\p{P}\p{S}]/u,U1=/(?!~)[\s\p{P}\p{S}]/u,B1=/(?:[^\s\p{P}\p{S}]|~)/u,H1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Av=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,z1=pt(Av,"u").replace(/punct/g,ur).getRegex(),j1=pt(Av,"u").replace(/punct/g,Ev).getRegex(),Rv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",V1=pt(Rv,"gu").replace(/notPunctSpace/g,Cv).replace(/punctSpace/g,Pd).replace(/punct/g,ur).getRegex(),q1=pt(Rv,"gu").replace(/notPunctSpace/g,B1).replace(/punctSpace/g,U1).replace(/punct/g,Ev).getRegex(),G1=pt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Cv).replace(/punctSpace/g,Pd).replace(/punct/g,ur).getRegex(),K1=pt(/\\(punct)/,"gu").replace(/punct/g,ur).getRegex(),W1=pt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),J1=pt(Nd).replace("(?:-->|$)","-->").getRegex(),Z1=pt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",J1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Lo=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Y1=pt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Lo).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Iv=pt(/^!?\[(label)\]\[(ref)\]/).replace("label",Lo).replace("ref",Ld).getRegex(),Ov=pt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Ld).getRegex(),Q1=pt("reflink|nolink(?!\\()","g").replace("reflink",Iv).replace("nolink",Ov).getRegex(),Md={_backpedal:Wi,anyPunctuation:K1,autolink:W1,blockSkip:H1,br:Tv,code:M1,del:Wi,emStrongLDelim:z1,emStrongRDelimAst:V1,emStrongRDelimUnd:G1,escape:P1,link:Y1,nolink:Ov,punctuation:$1,reflink:Iv,reflinkSearch:Q1,tag:Z1,text:F1,url:Wi},X1={...Md,link:pt(/^!?\[(label)\]\((.*?)\)/).replace("label",Lo).getRegex(),reflink:pt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Lo).getRegex()},Sc={...Md,emStrongRDelimAst:q1,emStrongLDelim:j1,url:pt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},eT={...Sc,br:pt(Tv).replace("{2,}","*").getRegex(),text:pt(Sc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Wl={normal:Dd,gfm:N1,pedantic:D1},Ni={normal:Md,gfm:Sc,breaks:eT,pedantic:X1},tT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},jp=e=>tT[e];function la(e,t){if(t){if(ps.escapeTest.test(e))return e.replace(ps.escapeReplace,jp)}else if(ps.escapeTestNoEncode.test(e))return e.replace(ps.escapeReplaceNoEncode,jp);return e}function Vp(e){try{e=encodeURI(e).replace(ps.percentDecode,"%")}catch{return null}return e}function qp(e,t){var i;const s=e.replace(ps.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(ps.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(ps.slashPipe,"|");return a}function Di(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function sT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function Gp(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function aT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var No=class{constructor(e){vt(this,"options");vt(this,"rules");vt(this,"lexer");this.options=e||On}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Di(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=aT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Di(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Di(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Di(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,a=a.substring(0,a.length-h.raw.length)+v.raw,n=n.substring(0,n.length-h.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,a=a.substring(0,a.length-p.raw.length)+v.raw,n=n.substring(0,n.length-h.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,A=>" ".repeat(3*A.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const A=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),_=this.rules.other.htmlBeginRegex(m);for(;e;){const w=e.split(`
`,1)[0];let C;if(p=w,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),C=p):C=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||_.test(p)||A.test(p)||y.test(p))break;if(C.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+C.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=w+`
`,e=e.substring(w.length+1),u=C.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,k;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(k=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!v,checked:k,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=qp(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(qp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Di(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=sT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),Gp(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Gp(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ra=class Tc{constructor(t){vt(this,"tokens");vt(this,"options");vt(this,"state");vt(this,"tokenizer");vt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||On,this.options.tokenizer=this.options.tokenizer||new No,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ps,block:Wl.normal,inline:Ni.normal};this.options.pedantic?(s.block=Wl.pedantic,s.inline=Ni.pedantic):this.options.gfm&&(s.block=Wl.gfm,this.options.breaks?s.inline=Ni.breaks:s.inline=Ni.gfm),this.tokenizer.rules=s}static get rules(){return{block:Wl,inline:Ni}}static lex(t,s){return new Tc(s).lex(t)}static lexInline(t,s){return new Tc(s).inlineTokens(t)}lex(t){t=t.replace(ps.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(ps.tabCharGlobal,"    ").replace(ps.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Do=class{constructor(e){vt(this,"options");vt(this,"parser");this.options=e||On}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(ps.notSpaceStart))==null?void 0:i[0],n=e.replace(ps.endingNewline,"")+`
`;return a?'<pre><code class="language-'+la(a)+'">'+(s?n:la(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:la(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+la(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${la(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Vp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+la(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Vp(e);if(n===null)return la(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${la(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:la(e.text)}},Fd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ia=class Cc{constructor(t){vt(this,"options");vt(this,"renderer");vt(this,"textRenderer");this.options=t||On,this.options.renderer=this.options.renderer||new Do,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Fd}static parse(t,s){return new Cc(s).parse(t)}static parseInline(t,s){return new Cc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Br,so=(Br=class{constructor(e){vt(this,"options");vt(this,"block");this.options=e||On}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ra.lex:Ra.lexInline}provideParser(){return this.block?Ia.parse:Ia.parseInline}},vt(Br,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Br),nT=class{constructor(...e){vt(this,"defaults",Rd());vt(this,"options",this.setOptions);vt(this,"parse",this.parseMarkdown(!0));vt(this,"parseInline",this.parseMarkdown(!1));vt(this,"Parser",Ia);vt(this,"Renderer",Do);vt(this,"TextRenderer",Fd);vt(this,"Lexer",Ra);vt(this,"Tokenizer",No);vt(this,"Hooks",so);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Do(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new No(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new so;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];so.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ra.lex(e,t??this.defaults)}parser(e,t){return Ia.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Ra.lex:Ra.lexInline,r=i.hooks?i.hooks.provideParser():e?Ia.parse:Ia.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+la(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Tn=new nT;function ct(e,t){return Tn.parse(e,t)}ct.options=ct.setOptions=function(e){return Tn.setOptions(e),ct.defaults=Tn.defaults,_v(ct.defaults),ct};ct.getDefaults=Rd;ct.defaults=On;ct.use=function(...e){return Tn.use(...e),ct.defaults=Tn.defaults,_v(ct.defaults),ct};ct.walkTokens=function(e,t){return Tn.walkTokens(e,t)};ct.parseInline=Tn.parseInline;ct.Parser=Ia;ct.parser=Ia.parse;ct.Renderer=Do;ct.TextRenderer=Fd;ct.Lexer=Ra;ct.lexer=Ra.lex;ct.Tokenizer=No;ct.Hooks=so;ct.parse=ct;ct.options;ct.setOptions;ct.use;ct.walkTokens;ct.parseInline;Ia.parse;Ra.lex;const iT={breaks:!0,gfm:!0};function Kp(e){if(!e)return"";try{if(typeof ct<"u"&&ct.parse){const t=ct.parse(e,iT);return typeof Hp<"u"?Hp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function lT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const oT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function rT(e){return oT[e]||"wrench"}const cT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Wp(e){if(!e)return[];const t=e.match(cT);return t?[...new Set(t)]:[]}const dT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=z(()=>t.value.trim().length>0&&!s.value),p=f(st.state||"disconnected");let h=null;const m=z(()=>{const P=p.value;return P==="connected"?"Connected":P==="reconnecting"?"Reconnecting…":P==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],k=z(()=>{const P=Math.floor(l.value/4)%v.length,L=l.value;return L>3?`${v[P]} (${L}s)`:v[0]});function A(){Ot(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const P=i.value;P.style.height="auto",P.style.height=Math.min(P.scrollHeight,120)+"px"}function g(P,L,N={}){const ne={id:++c,role:P,content:L,timestamp:Date.now(),html:P==="bot"?Kp(L):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:P==="bot"?Wp(L):[],files:N.files||[],_showTools:!1};return e.value.push(ne),A(),P==="bot"&&Ot(()=>b()),ne}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const ne=L.querySelector("code"),le=ne?ne.textContent:L.textContent;navigator.clipboard.writeText(le).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(N)})}function _(P){if(P===0)return!0;const L=e.value[P-1],N=e.value[P],ne=new Date(L.timestamp).toDateString(),le=new Date(N.timestamp).toDateString();return ne!==le}function w(P){const L=new Date(P),N=new Date;if(L.toDateString()===N.toDateString())return"Today";const ne=new Date(N);return ne.setDate(ne.getDate()-1),L.toDateString()===ne.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function C(P){t.value=P,Ot(()=>V())}function S(P){window.open(P,"_blank","noopener")}function x(P){P.target.style.display="none"}function O(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function $(){r&&(clearInterval(r),r=null),l.value=0}function E(P){s.value&&(s.value=!1,$(),P.type==="chat_response"?g("bot",P.content,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]}):P.type==="chat_error"&&g("bot",P.error||"Unknown error",{is_error:!0}),Ot(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function M(P){try{const L=await B.post("/api/chat",{content:P,channel_id:o.value});g("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){g("bot",L.message||"Failed to send message",{is_error:!0})}}async function V(){const P=t.value.trim();if(!P||s.value)return;g("user",P),t.value="",s.value=!0,O(),i.value&&(i.value.style.height="auto"),st.connected&&st.sendChat(P,{channelId:o.value})||(await M(P),s.value=!1,$()),Ot(()=>{var N;return(N=i.value)==null?void 0:N.focus()})}async function G(){a.value="";try{if(!o.value){const L=await B.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const P=await B.get("/api/sessions/"+encodeURIComponent(o.value));if(P&&P.messages&&P.messages.length>0){for(const L of P.messages){const N=L.role==="user"?"user":"bot";let ne=L.content||"";if(N==="user"){const U=ne.match(/^\[.*?\]:\s*/);U&&(ne=ne.slice(U[0].length))}if(!ne.trim())continue;const le={id:++c,role:N,content:ne,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:N==="bot"?Kp(ne):"",tools_used:[],is_error:!1,images:N==="bot"?Wp(ne):[],files:[],_showTools:!1};e.value.push(le)}Ot(()=>{A(),b()})}}catch(P){P&&P.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",we.error(a.value))}}return Ge(()=>{st.subscribe("chat",E),p.value=st.state||"disconnected",h=st.onState(P=>{p.value=P}),G(),Ot(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}),ft(()=>{st.unsubscribe("chat",E),h&&(h(),h=null),$()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:k,suggestions:d,send:V,autoResize:y,formatTime:lT,formatDate:w,showDateSeparator:_,useSuggestion:C,openImage:S,onImageError:x,getToolIcon:rT,loadHistory:G}}},uT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=z(()=>e.value==="custom"),v=z(()=>[...i.value,...l.value]),k=z(()=>l.value.includes(e.value)),A=z(()=>{var S;return m.value?t.value||"Odin":((S=n.value[e.value])==null?void 0:S.name)||e.value}),y=z(()=>{var S;return m.value?s.value||"(empty — will use Odin default)":((S=n.value[e.value])==null?void 0:S.identity)||""}),g=z(()=>{var S;return m.value?a.value||"(empty — will use Odin default)":((S=n.value[e.value])==null?void 0:S.voice)||""});async function b(){d.value=!0;try{const S=await B.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",a.value=S.custom_voice||"",n.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{d.value=!1}}async function _(){o.value=!0,c.value=null,r.value=!1;try{await B.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(S){c.value=S.message}finally{o.value=!1}}async function w(){const S=u.value.trim();if(S){h.value=!0,c.value=null;try{await B.post("/api/personality/presets",{name:S,display_name:A.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function C(){if(await Kt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await B.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:v,isCustom:m,isUserPreset:k,previewName:A,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:_,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:w,deletePreset:C,builtinPresets:i,userPresets:l}},template:`
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
  `},pT={props:["onComplete"],template:`
    <main class="login-shell" role="main" aria-labelledby="setup-title">
      <section class="login-panel" aria-describedby="setup-copy">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">First-install setup</p>
        <h1 id="setup-title" class="login-title">Odin</h1>
        <p id="setup-copy" class="login-subtitle">Finish initialization with an optional web credential. Discord can be attached now or later.</p>

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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,h=null;function m(){return p+=1,h==null||h.abort(),h=null,p}function v(_,w,C){return typeof B.postWithOptions=="function"?B.postWithOptions(_,w,{signal:C}):B.post(_,w)}async function k(){var C,S;a.value=!0,i.value="",l.value="Saving setup…";const _={},w=!!s.value.trim();t.value.trim()&&(_.web_api_token=t.value.trim()),s.value.trim()&&(_.discord_token=s.value.trim());try{const x=B.post("/api/setup/complete",_);t.value="",s.value="";const O=await x,$=((C=O.discord)==null?void 0:C.state)||O.discord_status;$==="failed"?(i.value=((S=O.discord)==null?void 0:S.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):$==="connecting"?l.value="Saved. Connecting Discord…":$==="ready"?l.value="Saved. Discord ready.":w?l.value="Saved. Discord token stored; attachment status is pending.":l.value=O.message||"Setup saved. Ready to sign in.",n.value=!0}catch(x){i.value=x.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function A(){const _=m(),w=typeof AbortController=="function"?new AbortController:null;h=w,o.value=!0,u.value="";try{const C=await v("/api/codex/device-code",void 0,w==null?void 0:w.signal);if(_!==p)return;c.value=C,r.value="pending";const S=await v("/api/codex/device-poll",{device_auth_id:C.device_auth_id,user_code:C.user_code,interval:C.interval},w==null?void 0:w.signal);if(_!==p)return;d.value=S||{},r.value="ready"}catch(C){_===p&&(C==null?void 0:C.name)!=="AbortError"&&(u.value=C.message||"Device sign-in failed.",r.value="failed")}finally{_===p&&(o.value=!1,h=null)}}function y(){m(),o.value=!1,b()}function g(){var _;(_=e.onComplete)==null||_.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return ft(()=>{m()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:k,onComplete:g,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:A,cancelDeviceLogin:y,clearDeviceState:b}}},Tt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Lv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:GS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:dT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:ck,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Uk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:uT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:US,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Tt("/operations","live")},{path:"/agents",redirect:Tt("/operations","agents")},{path:"/loops",redirect:Tt("/operations","loops")},{path:"/processes",redirect:Tt("/operations","processes")},{path:"/schedules",redirect:Tt("/operations","schedules")},{path:"/audit",redirect:Tt("/history","audit")},{path:"/sessions",redirect:Tt("/history","sessions")},{path:"/traces",redirect:Tt("/history","traces")},{path:"/usage",redirect:Tt("/history","usage")},{path:"/tools",redirect:Tt("/capabilities","tools")},{path:"/skills",redirect:Tt("/capabilities","skills")},{path:"/mcp",redirect:Tt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Tt("/capabilities","knowledge")},{path:"/memory",redirect:Tt("/capabilities","memory")},{path:"/learned",redirect:Tt("/capabilities","learned")},{path:"/health",redirect:Tt("/system","health")},{path:"/resources",redirect:Tt("/system","resources")},{path:"/logs",redirect:Tt("/system","logs")},{path:"/config",redirect:Tt("/system","config")},{path:"/host-access",redirect:Tt("/system","host-access")},{path:"/hosts",redirect:Tt("/system","hosts")},{path:"/internals",redirect:Tt("/system","internals")}],Ji=Fw({history:mw(),routes:Lv});Ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const fT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{B.setPersist(n.value),await B.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},hT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),k=Lv.filter(U=>U.meta),A=z(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:k.filter(K=>K.meta.section===U)})).filter(U=>U.routes.length)),y=z(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=z(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=z(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function _(){st.disconnect(),P&&(clearInterval(P),P=null)}B.onSessionExpired=()=>{t.value=!0,_(),B.setToken(""),e.value="login"};function w(U){var K;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Cp());return}if(a.value&&U.key==="Tab"){const oe=[...((K=n.value)==null?void 0:K.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(oe.length){const W=oe[0],ue=oe[oe.length-1];if(U.shiftKey&&(document.activeElement===W||!n.value.contains(document.activeElement))){U.preventDefault(),ue.focus();return}if(!U.shiftKey&&(document.activeElement===ue||!n.value.contains(document.activeElement))){U.preventDefault(),W.focus();return}}}if(U.key==="Escape"&&a.value){a.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const oe=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');oe&&oe.focus()}}function C(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function S(){try{const U=await B.get("/api/setup/status");if(U.mode==="pending"||U.needed===!0)return _(),e.value="setup",!0}catch(U){U==null||U.name}return!1}Ge(async()=>{if(document.addEventListener("keydown",w),o=window.matchMedia("(max-width: 900px)"),C(),o.addEventListener("change",C),await S())return;const U=await B.check();U.ok?(e.value="ready",ne()):U.needsAuth?e.value="login":(e.value="ready",ne())});function x(){t.value=!1,e.value="ready",ne()}async function O(){if(await S())return;const U=await B.check();U.ok?(e.value="ready",ne()):U.needsAuth?e.value="login":(e.value="ready",ne())}async function $(){_(),e.value="login",await B.logout()}function E(){s.value=!s.value}function M(){a.value=!a.value}Ut(a,async U=>{var K,oe;if(U)r=document.activeElement,await Ot(),(oe=(K=n.value)==null?void 0:K.querySelector(".nav-item"))==null||oe.focus();else if(r!=null&&r.isConnected){const W=r;r=null,requestAnimationFrame(()=>W.focus())}});const V=z(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function G(U,K="info",oe=3e3){p.value={text:U,level:K},clearTimeout(h),h=setTimeout(()=>{p.value=null},oe)}let P=null,L=!1,N=[];function ne(){for(const U of N)U();N=[st.onStatus(U=>{c.value=U}),st.onLatencyChange(U=>{u.value=U}),st.onState((U,K)=>{d.value=U,U==="connected"?(L&&G("Connection restored","success"),L=!0):U==="reconnecting"&&K.attempt===1&&G("Connection lost — reconnecting…","warn")})],st.connect(),le(),P&&clearInterval(P),P=setInterval(le,15e3)}async function le(){try{const U=await B.get("/api/status");m.value=U.status==="online"?"online":"starting";const K=U.uptime_seconds||0,oe=Math.floor(K/3600),W=Math.floor(K%3600/60);v.value=`${oe}h ${W}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{P&&clearInterval(P);for(const U of N)U();N=[],st.disconnect(),document.removeEventListener("keydown",w),o==null||o.removeEventListener("change",C)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:V,wsToast:p,botStatus:m,botUptime:v,navRoutes:k,navGroups:A,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:x,onSetupComplete:O,logout:$,toggleSidebar:E,toggleMobileNavigation:M,openPalette:Cp}}},Ha=_o(hT);Ha.component("odin-icon",jS);Ha.component("login-screen",fT);Ha.component("setup-page",pT);Ha.component("toast-container",R_);Ha.component("confirm-host",I_);Ha.component("command-palette",zS);Ha.directive("modal-focus",qS);Ha.use(Ji);Ha.mount("#app");
