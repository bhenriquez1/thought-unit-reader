"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[16],{19:function(e,t,r){r.d(t,{JU:function(){return doc},QT:function(){return getDoc},ad:function(){return getFirestore},pl:function(){return setDoc}});var n,i,s,a,o=r(5816),l=r(8463),u=r(3333),c=r(4444),_=r(5062),h=r(4489);r(3454);var d=r(8764).lW;let m="@firebase/firestore";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let User=class User{constructor(e){this.uid=e}isAuthenticated(){return null!=this.uid}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}};User.UNAUTHENTICATED=new User(null),User.GOOGLE_CREDENTIALS=new User("google-credentials-uid"),User.FIRST_PARTY=new User("first-party-uid"),User.MOCK_USER=new User("mock-user");/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let f="10.14.0",g=new u.Yd("@firebase/firestore");function __PRIVATE_getLogLevel(){return g.logLevel}function __PRIVATE_logDebug(e,...t){if(g.logLevel<=u.in.DEBUG){let r=t.map(__PRIVATE_argToString);g.debug(`Firestore (${f}): ${e}`,...r)}}function __PRIVATE_logError(e,...t){if(g.logLevel<=u.in.ERROR){let r=t.map(__PRIVATE_argToString);g.error(`Firestore (${f}): ${e}`,...r)}}function __PRIVATE_logWarn(e,...t){if(g.logLevel<=u.in.WARN){let r=t.map(__PRIVATE_argToString);g.warn(`Firestore (${f}): ${e}`,...r)}}function __PRIVATE_argToString(e){if("string"==typeof e)return e;try{/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */return JSON.stringify(e)}catch(t){return e}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function fail(e="Unexpected state"){let t=`FIRESTORE (${f}) INTERNAL ASSERTION FAILED: `+e;throw __PRIVATE_logError(t),Error(t)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let p={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"};let FirestoreError=class FirestoreError extends c.ZR{constructor(e,t){super(e,t),this.code=e,this.message=t,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_Deferred=class __PRIVATE_Deferred{constructor(){this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_OAuthToken=class __PRIVATE_OAuthToken{constructor(e,t){this.user=t,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}};let __PRIVATE_EmptyAuthCredentialsProvider=class __PRIVATE_EmptyAuthCredentialsProvider{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,t){e.enqueueRetryable(()=>t(User.UNAUTHENTICATED))}shutdown(){}};let __PRIVATE_EmulatorAuthCredentialsProvider=class __PRIVATE_EmulatorAuthCredentialsProvider{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,t){this.changeListener=t,e.enqueueRetryable(()=>t(this.token.user))}shutdown(){this.changeListener=null}};let __PRIVATE_FirebaseAuthCredentialsProvider=class __PRIVATE_FirebaseAuthCredentialsProvider{constructor(e){this.t=e,this.currentUser=User.UNAUTHENTICATED,this.i=0,this.forceRefresh=!1,this.auth=null}start(e,t){void 0===this.o||fail();let r=this.i,__PRIVATE_guardedChangeListener=e=>this.i!==r?(r=this.i,t(e)):Promise.resolve(),n=new __PRIVATE_Deferred;this.o=()=>{this.i++,this.currentUser=this.u(),n.resolve(),n=new __PRIVATE_Deferred,e.enqueueRetryable(()=>__PRIVATE_guardedChangeListener(this.currentUser))};let __PRIVATE_awaitNextToken=()=>{let t=n;e.enqueueRetryable(async()=>{await t.promise,await __PRIVATE_guardedChangeListener(this.currentUser)})},__PRIVATE_registerAuth=e=>{__PRIVATE_logDebug("FirebaseAuthCredentialsProvider","Auth detected"),this.auth=e,this.o&&(this.auth.addAuthTokenListener(this.o),__PRIVATE_awaitNextToken())};this.t.onInit(e=>__PRIVATE_registerAuth(e)),setTimeout(()=>{if(!this.auth){let e=this.t.getImmediate({optional:!0});e?__PRIVATE_registerAuth(e):(__PRIVATE_logDebug("FirebaseAuthCredentialsProvider","Auth not yet detected"),n.resolve(),n=new __PRIVATE_Deferred)}},0),__PRIVATE_awaitNextToken()}getToken(){let e=this.i,t=this.forceRefresh;return this.forceRefresh=!1,this.auth?this.auth.getToken(t).then(t=>this.i!==e?(__PRIVATE_logDebug("FirebaseAuthCredentialsProvider","getToken aborted due to token change."),this.getToken()):t?("string"==typeof t.accessToken||fail(),new __PRIVATE_OAuthToken(t.accessToken,this.currentUser)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.auth&&this.o&&this.auth.removeAuthTokenListener(this.o),this.o=void 0}u(){let e=this.auth&&this.auth.getUid();return null===e||"string"==typeof e||fail(),new User(e)}};let __PRIVATE_FirstPartyToken=class __PRIVATE_FirstPartyToken{constructor(e,t,r){this.l=e,this.h=t,this.P=r,this.type="FirstParty",this.user=User.FIRST_PARTY,this.I=new Map}T(){return this.P?this.P():null}get headers(){this.I.set("X-Goog-AuthUser",this.l);let e=this.T();return e&&this.I.set("Authorization",e),this.h&&this.I.set("X-Goog-Iam-Authorization-Token",this.h),this.I}};let __PRIVATE_FirstPartyAuthCredentialsProvider=class __PRIVATE_FirstPartyAuthCredentialsProvider{constructor(e,t,r){this.l=e,this.h=t,this.P=r}getToken(){return Promise.resolve(new __PRIVATE_FirstPartyToken(this.l,this.h,this.P))}start(e,t){e.enqueueRetryable(()=>t(User.FIRST_PARTY))}shutdown(){}invalidateToken(){}};let AppCheckToken=class AppCheckToken{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}};let __PRIVATE_FirebaseAppCheckTokenProvider=class __PRIVATE_FirebaseAppCheckTokenProvider{constructor(e){this.A=e,this.forceRefresh=!1,this.appCheck=null,this.R=null}start(e,t){void 0===this.o||fail();let onTokenChanged=e=>{null!=e.error&&__PRIVATE_logDebug("FirebaseAppCheckTokenProvider",`Error getting App Check token; using placeholder token instead. Error: ${e.error.message}`);let r=e.token!==this.R;return this.R=e.token,__PRIVATE_logDebug("FirebaseAppCheckTokenProvider",`Received ${r?"new":"existing"} token.`),r?t(e.token):Promise.resolve()};this.o=t=>{e.enqueueRetryable(()=>onTokenChanged(t))};let __PRIVATE_registerAppCheck=e=>{__PRIVATE_logDebug("FirebaseAppCheckTokenProvider","AppCheck detected"),this.appCheck=e,this.o&&this.appCheck.addTokenListener(this.o)};this.A.onInit(e=>__PRIVATE_registerAppCheck(e)),setTimeout(()=>{if(!this.appCheck){let e=this.A.getImmediate({optional:!0});e?__PRIVATE_registerAppCheck(e):__PRIVATE_logDebug("FirebaseAppCheckTokenProvider","AppCheck not yet detected")}},0)}getToken(){let e=this.forceRefresh;return this.forceRefresh=!1,this.appCheck?this.appCheck.getToken(e).then(e=>e?("string"==typeof e.token||fail(),this.R=e.token,new AppCheckToken(e.token)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.appCheck&&this.o&&this.appCheck.removeTokenListener(this.o),this.o=void 0}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_AutoId=class __PRIVATE_AutoId{static newId(){let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t=Math.floor(256/e.length)*e.length,r="";for(;r.length<20;){let n=/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function(e){let t="undefined"!=typeof self&&(self.crypto||self.msCrypto),r=new Uint8Array(e);if(t&&"function"==typeof t.getRandomValues)t.getRandomValues(r);else for(let t=0;t<e;t++)r[t]=Math.floor(256*Math.random());return r}(40);for(let i=0;i<n.length;++i)r.length<20&&n[i]<t&&(r+=e.charAt(n[i]%e.length))}return r}};function __PRIVATE_primitiveComparator(e,t){return e<t?-1:e>t?1:0}function __PRIVATE_arrayEquals(e,t,r){return e.length===t.length&&e.every((e,n)=>r(e,t[n]))}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Timestamp=class Timestamp{constructor(e,t){if(this.seconds=e,this.nanoseconds=t,t<0||t>=1e9)throw new FirestoreError(p.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(e<-62135596800||e>=253402300800)throw new FirestoreError(p.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e)}static now(){return Timestamp.fromMillis(Date.now())}static fromDate(e){return Timestamp.fromMillis(e.getTime())}static fromMillis(e){let t=Math.floor(e/1e3),r=Math.floor(1e6*(e-1e3*t));return new Timestamp(t,r)}toDate(){return new Date(this.toMillis())}toMillis(){return 1e3*this.seconds+this.nanoseconds/1e6}_compareTo(e){return this.seconds===e.seconds?__PRIVATE_primitiveComparator(this.nanoseconds,e.nanoseconds):__PRIVATE_primitiveComparator(this.seconds,e.seconds)}isEqual(e){return e.seconds===this.seconds&&e.nanoseconds===this.nanoseconds}toString(){return"Timestamp(seconds="+this.seconds+", nanoseconds="+this.nanoseconds+")"}toJSON(){return{seconds:this.seconds,nanoseconds:this.nanoseconds}}valueOf(){let e=this.seconds- -62135596800;return String(e).padStart(12,"0")+"."+String(this.nanoseconds).padStart(9,"0")}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let SnapshotVersion=class SnapshotVersion{constructor(e){this.timestamp=e}static fromTimestamp(e){return new SnapshotVersion(e)}static min(){return new SnapshotVersion(new Timestamp(0,0))}static max(){return new SnapshotVersion(new Timestamp(253402300799,999999999))}compareTo(e){return this.timestamp._compareTo(e.timestamp)}isEqual(e){return this.timestamp.isEqual(e.timestamp)}toMicroseconds(){return 1e6*this.timestamp.seconds+this.timestamp.nanoseconds/1e3}toString(){return"SnapshotVersion("+this.timestamp.toString()+")"}toTimestamp(){return this.timestamp}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let BasePath=class BasePath{constructor(e,t,r){void 0===t?t=0:t>e.length&&fail(),void 0===r?r=e.length-t:r>e.length-t&&fail(),this.segments=e,this.offset=t,this.len=r}get length(){return this.len}isEqual(e){return 0===BasePath.comparator(this,e)}child(e){let t=this.segments.slice(this.offset,this.limit());return e instanceof BasePath?e.forEach(e=>{t.push(e)}):t.push(e),this.construct(t)}limit(){return this.offset+this.length}popFirst(e){return e=void 0===e?1:e,this.construct(this.segments,this.offset+e,this.length-e)}popLast(){return this.construct(this.segments,this.offset,this.length-1)}firstSegment(){return this.segments[this.offset]}lastSegment(){return this.get(this.length-1)}get(e){return this.segments[this.offset+e]}isEmpty(){return 0===this.length}isPrefixOf(e){if(e.length<this.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}isImmediateParentOf(e){if(this.length+1!==e.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}forEach(e){for(let t=this.offset,r=this.limit();t<r;t++)e(this.segments[t])}toArray(){return this.segments.slice(this.offset,this.limit())}static comparator(e,t){let r=Math.min(e.length,t.length);for(let n=0;n<r;n++){let r=e.get(n),i=t.get(n);if(r<i)return -1;if(r>i)return 1}return e.length<t.length?-1:e.length>t.length?1:0}};let ResourcePath=class ResourcePath extends BasePath{construct(e,t,r){return new ResourcePath(e,t,r)}canonicalString(){return this.toArray().join("/")}toString(){return this.canonicalString()}toUriEncodedString(){return this.toArray().map(encodeURIComponent).join("/")}static fromString(...e){let t=[];for(let r of e){if(r.indexOf("//")>=0)throw new FirestoreError(p.INVALID_ARGUMENT,`Invalid segment (${r}). Paths must not contain // in them.`);t.push(...r.split("/").filter(e=>e.length>0))}return new ResourcePath(t)}static emptyPath(){return new ResourcePath([])}};let E=/^[_a-zA-Z][_a-zA-Z0-9]*$/;let FieldPath$1=class FieldPath$1 extends BasePath{construct(e,t,r){return new FieldPath$1(e,t,r)}static isValidIdentifier(e){return E.test(e)}canonicalString(){return this.toArray().map(e=>(e=e.replace(/\\/g,"\\\\").replace(/`/g,"\\`"),FieldPath$1.isValidIdentifier(e)||(e="`"+e+"`"),e)).join(".")}toString(){return this.canonicalString()}isKeyField(){return 1===this.length&&"__name__"===this.get(0)}static keyField(){return new FieldPath$1(["__name__"])}static fromServerFormat(e){let t=[],r="",n=0,__PRIVATE_addCurrentSegment=()=>{if(0===r.length)throw new FirestoreError(p.INVALID_ARGUMENT,`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);t.push(r),r=""},i=!1;for(;n<e.length;){let t=e[n];if("\\"===t){if(n+1===e.length)throw new FirestoreError(p.INVALID_ARGUMENT,"Path has trailing escape character: "+e);let t=e[n+1];if("\\"!==t&&"."!==t&&"`"!==t)throw new FirestoreError(p.INVALID_ARGUMENT,"Path has invalid escape sequence: "+e);r+=t,n+=2}else"`"===t?i=!i:"."!==t||i?r+=t:__PRIVATE_addCurrentSegment(),n++}if(__PRIVATE_addCurrentSegment(),i)throw new FirestoreError(p.INVALID_ARGUMENT,"Unterminated ` in path: "+e);return new FieldPath$1(t)}static emptyPath(){return new FieldPath$1([])}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let DocumentKey=class DocumentKey{constructor(e){this.path=e}static fromPath(e){return new DocumentKey(ResourcePath.fromString(e))}static fromName(e){return new DocumentKey(ResourcePath.fromString(e).popFirst(5))}static empty(){return new DocumentKey(ResourcePath.emptyPath())}get collectionGroup(){return this.path.popLast().lastSegment()}hasCollectionId(e){return this.path.length>=2&&this.path.get(this.path.length-2)===e}getCollectionGroup(){return this.path.get(this.path.length-2)}getCollectionPath(){return this.path.popLast()}isEqual(e){return null!==e&&0===ResourcePath.comparator(this.path,e.path)}toString(){return this.path.toString()}static comparator(e,t){return ResourcePath.comparator(e.path,t.path)}static isDocumentKey(e){return e.length%2==0}static fromSegments(e){return new DocumentKey(new ResourcePath(e.slice()))}};let IndexOffset=class IndexOffset{constructor(e,t,r){this.readTime=e,this.documentKey=t,this.largestBatchId=r}static min(){return new IndexOffset(SnapshotVersion.min(),DocumentKey.empty(),-1)}static max(){return new IndexOffset(SnapshotVersion.max(),DocumentKey.empty(),-1)}};let PersistenceTransaction=class PersistenceTransaction{constructor(){this.onCommittedListeners=[]}addOnCommittedListener(e){this.onCommittedListeners.push(e)}raiseOnCommittedEvent(){this.onCommittedListeners.forEach(e=>e())}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function __PRIVATE_ignoreIfPrimaryLeaseLoss(e){if(e.code!==p.FAILED_PRECONDITION||"The current tab is not in the required state to perform this operation. It might be necessary to refresh the browser tab."!==e.message)throw e;__PRIVATE_logDebug("LocalStore","Unexpectedly lost primary lease")}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let PersistencePromise=class PersistencePromise{constructor(e){this.nextCallback=null,this.catchCallback=null,this.result=void 0,this.error=void 0,this.isDone=!1,this.callbackAttached=!1,e(e=>{this.isDone=!0,this.result=e,this.nextCallback&&this.nextCallback(e)},e=>{this.isDone=!0,this.error=e,this.catchCallback&&this.catchCallback(e)})}catch(e){return this.next(void 0,e)}next(e,t){return this.callbackAttached&&fail(),this.callbackAttached=!0,this.isDone?this.error?this.wrapFailure(t,this.error):this.wrapSuccess(e,this.result):new PersistencePromise((r,n)=>{this.nextCallback=t=>{this.wrapSuccess(e,t).next(r,n)},this.catchCallback=e=>{this.wrapFailure(t,e).next(r,n)}})}toPromise(){return new Promise((e,t)=>{this.next(e,t)})}wrapUserFunction(e){try{let t=e();return t instanceof PersistencePromise?t:PersistencePromise.resolve(t)}catch(e){return PersistencePromise.reject(e)}}wrapSuccess(e,t){return e?this.wrapUserFunction(()=>e(t)):PersistencePromise.resolve(t)}wrapFailure(e,t){return e?this.wrapUserFunction(()=>e(t)):PersistencePromise.reject(t)}static resolve(e){return new PersistencePromise((t,r)=>{t(e)})}static reject(e){return new PersistencePromise((t,r)=>{r(e)})}static waitFor(e){return new PersistencePromise((t,r)=>{let n=0,i=0,s=!1;e.forEach(e=>{++n,e.next(()=>{++i,s&&i===n&&t()},e=>r(e))}),s=!0,i===n&&t()})}static or(e){let t=PersistencePromise.resolve(!1);for(let r of e)t=t.next(e=>e?PersistencePromise.resolve(e):r());return t}static forEach(e,t){let r=[];return e.forEach((e,n)=>{r.push(t.call(this,e,n))}),this.waitFor(r)}static mapArray(e,t){return new PersistencePromise((r,n)=>{let i=e.length,s=Array(i),a=0;for(let o=0;o<i;o++){let l=o;t(e[l]).next(e=>{s[l]=e,++a===i&&r(s)},e=>n(e))}})}static doWhile(e,t){return new PersistencePromise((r,n)=>{let process=()=>{!0===e()?t().next(()=>{process()},n):r()};process()})}};function __PRIVATE_isIndexedDbTransactionError(e){return"IndexedDbTransactionError"===e.name}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_ListenSequence=class __PRIVATE_ListenSequence{constructor(e,t){this.previousValue=e,t&&(t.sequenceNumberHandler=e=>this.ie(e),this.se=e=>t.writeSequenceNumber(e))}ie(e){return this.previousValue=Math.max(e,this.previousValue),this.previousValue}next(){let e=++this.previousValue;return this.se&&this.se(e),e}};function __PRIVATE_isNegativeZero(e){return 0===e&&1/e==-1/0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function __PRIVATE_objectSize(e){let t=0;for(let r in e)Object.prototype.hasOwnProperty.call(e,r)&&t++;return t}function forEach(e,t){for(let r in e)Object.prototype.hasOwnProperty.call(e,r)&&t(r,e[r])}function isEmpty(e){for(let t in e)if(Object.prototype.hasOwnProperty.call(e,t))return!1;return!0}__PRIVATE_ListenSequence.oe=-1;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let SortedMap=class SortedMap{constructor(e,t){this.comparator=e,this.root=t||LLRBNode.EMPTY}insert(e,t){return new SortedMap(this.comparator,this.root.insert(e,t,this.comparator).copy(null,null,LLRBNode.BLACK,null,null))}remove(e){return new SortedMap(this.comparator,this.root.remove(e,this.comparator).copy(null,null,LLRBNode.BLACK,null,null))}get(e){let t=this.root;for(;!t.isEmpty();){let r=this.comparator(e,t.key);if(0===r)return t.value;r<0?t=t.left:r>0&&(t=t.right)}return null}indexOf(e){let t=0,r=this.root;for(;!r.isEmpty();){let n=this.comparator(e,r.key);if(0===n)return t+r.left.size;n<0?r=r.left:(t+=r.left.size+1,r=r.right)}return -1}isEmpty(){return this.root.isEmpty()}get size(){return this.root.size}minKey(){return this.root.minKey()}maxKey(){return this.root.maxKey()}inorderTraversal(e){return this.root.inorderTraversal(e)}forEach(e){this.inorderTraversal((t,r)=>(e(t,r),!1))}toString(){let e=[];return this.inorderTraversal((t,r)=>(e.push(`${t}:${r}`),!1)),`{${e.join(", ")}}`}reverseTraversal(e){return this.root.reverseTraversal(e)}getIterator(){return new SortedMapIterator(this.root,null,this.comparator,!1)}getIteratorFrom(e){return new SortedMapIterator(this.root,e,this.comparator,!1)}getReverseIterator(){return new SortedMapIterator(this.root,null,this.comparator,!0)}getReverseIteratorFrom(e){return new SortedMapIterator(this.root,e,this.comparator,!0)}};let SortedMapIterator=class SortedMapIterator{constructor(e,t,r,n){this.isReverse=n,this.nodeStack=[];let i=1;for(;!e.isEmpty();)if(i=t?r(e.key,t):1,t&&n&&(i*=-1),i<0)e=this.isReverse?e.left:e.right;else{if(0===i){this.nodeStack.push(e);break}this.nodeStack.push(e),e=this.isReverse?e.right:e.left}}getNext(){let e=this.nodeStack.pop(),t={key:e.key,value:e.value};if(this.isReverse)for(e=e.left;!e.isEmpty();)this.nodeStack.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack.push(e),e=e.left;return t}hasNext(){return this.nodeStack.length>0}peek(){if(0===this.nodeStack.length)return null;let e=this.nodeStack[this.nodeStack.length-1];return{key:e.key,value:e.value}}};let LLRBNode=class LLRBNode{constructor(e,t,r,n,i){this.key=e,this.value=t,this.color=null!=r?r:LLRBNode.RED,this.left=null!=n?n:LLRBNode.EMPTY,this.right=null!=i?i:LLRBNode.EMPTY,this.size=this.left.size+1+this.right.size}copy(e,t,r,n,i){return new LLRBNode(null!=e?e:this.key,null!=t?t:this.value,null!=r?r:this.color,null!=n?n:this.left,null!=i?i:this.right)}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min(){return this.left.isEmpty()?this:this.left.min()}minKey(){return this.min().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,r){let n=this,i=r(e,n.key);return(n=i<0?n.copy(null,null,null,n.left.insert(e,t,r),null):0===i?n.copy(null,t,null,null,null):n.copy(null,null,null,null,n.right.insert(e,t,r))).fixUp()}removeMin(){if(this.left.isEmpty())return LLRBNode.EMPTY;let e=this;return e.left.isRed()||e.left.left.isRed()||(e=e.moveRedLeft()),(e=e.copy(null,null,null,e.left.removeMin(),null)).fixUp()}remove(e,t){let r,n=this;if(0>t(e,n.key))n.left.isEmpty()||n.left.isRed()||n.left.left.isRed()||(n=n.moveRedLeft()),n=n.copy(null,null,null,n.left.remove(e,t),null);else{if(n.left.isRed()&&(n=n.rotateRight()),n.right.isEmpty()||n.right.isRed()||n.right.left.isRed()||(n=n.moveRedRight()),0===t(e,n.key)){if(n.right.isEmpty())return LLRBNode.EMPTY;r=n.right.min(),n=n.copy(r.key,r.value,null,null,n.right.removeMin())}n=n.copy(null,null,null,null,n.right.remove(e,t))}return n.fixUp()}isRed(){return this.color}fixUp(){let e=this;return e.right.isRed()&&!e.left.isRed()&&(e=e.rotateLeft()),e.left.isRed()&&e.left.left.isRed()&&(e=e.rotateRight()),e.left.isRed()&&e.right.isRed()&&(e=e.colorFlip()),e}moveRedLeft(){let e=this.colorFlip();return e.right.left.isRed()&&(e=(e=(e=e.copy(null,null,null,null,e.right.rotateRight())).rotateLeft()).colorFlip()),e}moveRedRight(){let e=this.colorFlip();return e.left.left.isRed()&&(e=(e=e.rotateRight()).colorFlip()),e}rotateLeft(){let e=this.copy(null,null,LLRBNode.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight(){let e=this.copy(null,null,LLRBNode.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip(){let e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth(){let e=this.check();return Math.pow(2,e)<=this.size+1}check(){if(this.isRed()&&this.left.isRed()||this.right.isRed())throw fail();let e=this.left.check();if(e!==this.right.check())throw fail();return e+(this.isRed()?0:1)}};LLRBNode.EMPTY=null,LLRBNode.RED=!0,LLRBNode.BLACK=!1,LLRBNode.EMPTY=new class{constructor(){this.size=0}get key(){throw fail()}get value(){throw fail()}get color(){throw fail()}get left(){throw fail()}get right(){throw fail()}copy(e,t,r,n,i){return this}insert(e,t,r){return new LLRBNode(e,t)}remove(e,t){return this}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}isRed(){return!1}checkMaxDepth(){return!0}check(){return 0}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let SortedSet=class SortedSet{constructor(e){this.comparator=e,this.data=new SortedMap(this.comparator)}has(e){return null!==this.data.get(e)}first(){return this.data.minKey()}last(){return this.data.maxKey()}get size(){return this.data.size}indexOf(e){return this.data.indexOf(e)}forEach(e){this.data.inorderTraversal((t,r)=>(e(t),!1))}forEachInRange(e,t){let r=this.data.getIteratorFrom(e[0]);for(;r.hasNext();){let n=r.getNext();if(this.comparator(n.key,e[1])>=0)return;t(n.key)}}forEachWhile(e,t){let r;for(r=void 0!==t?this.data.getIteratorFrom(t):this.data.getIterator();r.hasNext();)if(!e(r.getNext().key))return}firstAfterOrEqual(e){let t=this.data.getIteratorFrom(e);return t.hasNext()?t.getNext().key:null}getIterator(){return new SortedSetIterator(this.data.getIterator())}getIteratorFrom(e){return new SortedSetIterator(this.data.getIteratorFrom(e))}add(e){return this.copy(this.data.remove(e).insert(e,!0))}delete(e){return this.has(e)?this.copy(this.data.remove(e)):this}isEmpty(){return this.data.isEmpty()}unionWith(e){let t=this;return t.size<e.size&&(t=e,e=this),e.forEach(e=>{t=t.add(e)}),t}isEqual(e){if(!(e instanceof SortedSet)||this.size!==e.size)return!1;let t=this.data.getIterator(),r=e.data.getIterator();for(;t.hasNext();){let e=t.getNext().key,n=r.getNext().key;if(0!==this.comparator(e,n))return!1}return!0}toArray(){let e=[];return this.forEach(t=>{e.push(t)}),e}toString(){let e=[];return this.forEach(t=>e.push(t)),"SortedSet("+e.toString()+")"}copy(e){let t=new SortedSet(this.comparator);return t.data=e,t}};let SortedSetIterator=class SortedSetIterator{constructor(e){this.iter=e}getNext(){return this.iter.getNext().key}hasNext(){return this.iter.hasNext()}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let FieldMask=class FieldMask{constructor(e){this.fields=e,e.sort(FieldPath$1.comparator)}static empty(){return new FieldMask([])}unionWith(e){let t=new SortedSet(FieldPath$1.comparator);for(let e of this.fields)t=t.add(e);for(let r of e)t=t.add(r);return new FieldMask(t.toArray())}covers(e){for(let t of this.fields)if(t.isPrefixOf(e))return!0;return!1}isEqual(e){return __PRIVATE_arrayEquals(this.fields,e.fields,(e,t)=>e.isEqual(t))}};/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_Base64DecodeError=class __PRIVATE_Base64DecodeError extends Error{constructor(){super(...arguments),this.name="Base64DecodeError"}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let ByteString=class ByteString{constructor(e){this.binaryString=e}static fromBase64String(e){let t=function(e){try{return atob(e)}catch(e){throw"undefined"!=typeof DOMException&&e instanceof DOMException?new __PRIVATE_Base64DecodeError("Invalid base64 string: "+e):e}}(e);return new ByteString(t)}static fromUint8Array(e){let t=function(e){let t="";for(let r=0;r<e.length;++r)t+=String.fromCharCode(e[r]);return t}(e);return new ByteString(t)}[Symbol.iterator](){let e=0;return{next:()=>e<this.binaryString.length?{value:this.binaryString.charCodeAt(e++),done:!1}:{value:void 0,done:!0}}}toBase64(){return btoa(this.binaryString)}toUint8Array(){return function(e){let t=new Uint8Array(e.length);for(let r=0;r<e.length;r++)t[r]=e.charCodeAt(r);return t}(this.binaryString)}approximateByteSize(){return 2*this.binaryString.length}compareTo(e){return __PRIVATE_primitiveComparator(this.binaryString,e.binaryString)}isEqual(e){return this.binaryString===e.binaryString}};ByteString.EMPTY_BYTE_STRING=new ByteString("");let T=new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);function __PRIVATE_normalizeTimestamp(e){if(e||fail(),"string"==typeof e){let t=0,r=T.exec(e);if(r||fail(),r[1]){let e=r[1];t=Number(e=(e+"000000000").substr(0,9))}let n=new Date(e);return{seconds:Math.floor(n.getTime()/1e3),nanos:t}}return{seconds:__PRIVATE_normalizeNumber(e.seconds),nanos:__PRIVATE_normalizeNumber(e.nanos)}}function __PRIVATE_normalizeNumber(e){return"number"==typeof e?e:"string"==typeof e?Number(e):0}function __PRIVATE_normalizeByteString(e){return"string"==typeof e?ByteString.fromBase64String(e):ByteString.fromUint8Array(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function __PRIVATE_isServerTimestamp(e){var t,r;return"server_timestamp"===(null===(r=((null===(t=null==e?void 0:e.mapValue)||void 0===t?void 0:t.fields)||{}).__type__)||void 0===r?void 0:r.stringValue)}function __PRIVATE_getPreviousValue(e){let t=e.mapValue.fields.__previous_value__;return __PRIVATE_isServerTimestamp(t)?__PRIVATE_getPreviousValue(t):t}function __PRIVATE_getLocalWriteTime(e){let t=__PRIVATE_normalizeTimestamp(e.mapValue.fields.__local_write_time__.timestampValue);return new Timestamp(t.seconds,t.nanos)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let DatabaseInfo=class DatabaseInfo{constructor(e,t,r,n,i,s,a,o,l){this.databaseId=e,this.appId=t,this.persistenceKey=r,this.host=n,this.ssl=i,this.forceLongPolling=s,this.autoDetectLongPolling=a,this.longPollingOptions=o,this.useFetchStreams=l}};let DatabaseId=class DatabaseId{constructor(e,t){this.projectId=e,this.database=t||"(default)"}static empty(){return new DatabaseId("","")}get isDefaultDatabase(){return"(default)"===this.database}isEqual(e){return e instanceof DatabaseId&&e.projectId===this.projectId&&e.database===this.database}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let I={mapValue:{fields:{__type__:{stringValue:"__max__"}}}};function __PRIVATE_typeOrder(e){return"nullValue"in e?0:"booleanValue"in e?1:"integerValue"in e||"doubleValue"in e?2:"timestampValue"in e?3:"stringValue"in e?5:"bytesValue"in e?6:"referenceValue"in e?7:"geoPointValue"in e?8:"arrayValue"in e?9:"mapValue"in e?__PRIVATE_isServerTimestamp(e)?4:__PRIVATE_isMaxValue(e)?9007199254740991:__PRIVATE_isVectorValue(e)?10:11:fail()}function __PRIVATE_valueEquals(e,t){if(e===t)return!0;let r=__PRIVATE_typeOrder(e);if(r!==__PRIVATE_typeOrder(t))return!1;switch(r){case 0:case 9007199254740991:return!0;case 1:return e.booleanValue===t.booleanValue;case 4:return __PRIVATE_getLocalWriteTime(e).isEqual(__PRIVATE_getLocalWriteTime(t));case 3:return function(e,t){if("string"==typeof e.timestampValue&&"string"==typeof t.timestampValue&&e.timestampValue.length===t.timestampValue.length)return e.timestampValue===t.timestampValue;let r=__PRIVATE_normalizeTimestamp(e.timestampValue),n=__PRIVATE_normalizeTimestamp(t.timestampValue);return r.seconds===n.seconds&&r.nanos===n.nanos}(e,t);case 5:return e.stringValue===t.stringValue;case 6:return __PRIVATE_normalizeByteString(e.bytesValue).isEqual(__PRIVATE_normalizeByteString(t.bytesValue));case 7:return e.referenceValue===t.referenceValue;case 8:return __PRIVATE_normalizeNumber(e.geoPointValue.latitude)===__PRIVATE_normalizeNumber(t.geoPointValue.latitude)&&__PRIVATE_normalizeNumber(e.geoPointValue.longitude)===__PRIVATE_normalizeNumber(t.geoPointValue.longitude);case 2:return function(e,t){if("integerValue"in e&&"integerValue"in t)return __PRIVATE_normalizeNumber(e.integerValue)===__PRIVATE_normalizeNumber(t.integerValue);if("doubleValue"in e&&"doubleValue"in t){let r=__PRIVATE_normalizeNumber(e.doubleValue),n=__PRIVATE_normalizeNumber(t.doubleValue);return r===n?__PRIVATE_isNegativeZero(r)===__PRIVATE_isNegativeZero(n):isNaN(r)&&isNaN(n)}return!1}(e,t);case 9:return __PRIVATE_arrayEquals(e.arrayValue.values||[],t.arrayValue.values||[],__PRIVATE_valueEquals);case 10:case 11:return function(e,t){let r=e.mapValue.fields||{},n=t.mapValue.fields||{};if(__PRIVATE_objectSize(r)!==__PRIVATE_objectSize(n))return!1;for(let e in r)if(r.hasOwnProperty(e)&&(void 0===n[e]||!__PRIVATE_valueEquals(r[e],n[e])))return!1;return!0}(e,t);default:return fail()}}function __PRIVATE_arrayValueContains(e,t){return void 0!==(e.values||[]).find(e=>__PRIVATE_valueEquals(e,t))}function __PRIVATE_valueCompare(e,t){if(e===t)return 0;let r=__PRIVATE_typeOrder(e),n=__PRIVATE_typeOrder(t);if(r!==n)return __PRIVATE_primitiveComparator(r,n);switch(r){case 0:case 9007199254740991:return 0;case 1:return __PRIVATE_primitiveComparator(e.booleanValue,t.booleanValue);case 2:return function(e,t){let r=__PRIVATE_normalizeNumber(e.integerValue||e.doubleValue),n=__PRIVATE_normalizeNumber(t.integerValue||t.doubleValue);return r<n?-1:r>n?1:r===n?0:isNaN(r)?isNaN(n)?0:-1:1}(e,t);case 3:return __PRIVATE_compareTimestamps(e.timestampValue,t.timestampValue);case 4:return __PRIVATE_compareTimestamps(__PRIVATE_getLocalWriteTime(e),__PRIVATE_getLocalWriteTime(t));case 5:return __PRIVATE_primitiveComparator(e.stringValue,t.stringValue);case 6:return function(e,t){let r=__PRIVATE_normalizeByteString(e),n=__PRIVATE_normalizeByteString(t);return r.compareTo(n)}(e.bytesValue,t.bytesValue);case 7:return function(e,t){let r=e.split("/"),n=t.split("/");for(let e=0;e<r.length&&e<n.length;e++){let t=__PRIVATE_primitiveComparator(r[e],n[e]);if(0!==t)return t}return __PRIVATE_primitiveComparator(r.length,n.length)}(e.referenceValue,t.referenceValue);case 8:return function(e,t){let r=__PRIVATE_primitiveComparator(__PRIVATE_normalizeNumber(e.latitude),__PRIVATE_normalizeNumber(t.latitude));return 0!==r?r:__PRIVATE_primitiveComparator(__PRIVATE_normalizeNumber(e.longitude),__PRIVATE_normalizeNumber(t.longitude))}(e.geoPointValue,t.geoPointValue);case 9:return __PRIVATE_compareArrays(e.arrayValue,t.arrayValue);case 10:return function(e,t){var r,n,i,s;let a=e.fields||{},o=t.fields||{},l=null===(r=a.value)||void 0===r?void 0:r.arrayValue,u=null===(n=o.value)||void 0===n?void 0:n.arrayValue,c=__PRIVATE_primitiveComparator((null===(i=null==l?void 0:l.values)||void 0===i?void 0:i.length)||0,(null===(s=null==u?void 0:u.values)||void 0===s?void 0:s.length)||0);return 0!==c?c:__PRIVATE_compareArrays(l,u)}(e.mapValue,t.mapValue);case 11:return function(e,t){if(e===I.mapValue&&t===I.mapValue)return 0;if(e===I.mapValue)return 1;if(t===I.mapValue)return -1;let r=e.fields||{},n=Object.keys(r),i=t.fields||{},s=Object.keys(i);n.sort(),s.sort();for(let e=0;e<n.length&&e<s.length;++e){let t=__PRIVATE_primitiveComparator(n[e],s[e]);if(0!==t)return t;let a=__PRIVATE_valueCompare(r[n[e]],i[s[e]]);if(0!==a)return a}return __PRIVATE_primitiveComparator(n.length,s.length)}(e.mapValue,t.mapValue);default:throw fail()}}function __PRIVATE_compareTimestamps(e,t){if("string"==typeof e&&"string"==typeof t&&e.length===t.length)return __PRIVATE_primitiveComparator(e,t);let r=__PRIVATE_normalizeTimestamp(e),n=__PRIVATE_normalizeTimestamp(t),i=__PRIVATE_primitiveComparator(r.seconds,n.seconds);return 0!==i?i:__PRIVATE_primitiveComparator(r.nanos,n.nanos)}function __PRIVATE_compareArrays(e,t){let r=e.values||[],n=t.values||[];for(let e=0;e<r.length&&e<n.length;++e){let t=__PRIVATE_valueCompare(r[e],n[e]);if(t)return t}return __PRIVATE_primitiveComparator(r.length,n.length)}function __PRIVATE_canonifyValue(e){var t,r;return"nullValue"in e?"null":"booleanValue"in e?""+e.booleanValue:"integerValue"in e?""+e.integerValue:"doubleValue"in e?""+e.doubleValue:"timestampValue"in e?function(e){let t=__PRIVATE_normalizeTimestamp(e);return`time(${t.seconds},${t.nanos})`}(e.timestampValue):"stringValue"in e?e.stringValue:"bytesValue"in e?__PRIVATE_normalizeByteString(e.bytesValue).toBase64():"referenceValue"in e?(t=e.referenceValue,DocumentKey.fromName(t).toString()):"geoPointValue"in e?(r=e.geoPointValue,`geo(${r.latitude},${r.longitude})`):"arrayValue"in e?function(e){let t="[",r=!0;for(let n of e.values||[])r?r=!1:t+=",",t+=__PRIVATE_canonifyValue(n);return t+"]"}(e.arrayValue):"mapValue"in e?function(e){let t=Object.keys(e.fields||{}).sort(),r="{",n=!0;for(let i of t)n?n=!1:r+=",",r+=`${i}:${__PRIVATE_canonifyValue(e.fields[i])}`;return r+"}"}(e.mapValue):fail()}function isInteger(e){return!!e&&"integerValue"in e}function isArray(e){return!!e&&"arrayValue"in e}function __PRIVATE_isNullValue(e){return!!e&&"nullValue"in e}function __PRIVATE_isNanValue(e){return!!e&&"doubleValue"in e&&isNaN(Number(e.doubleValue))}function __PRIVATE_isMapValue(e){return!!e&&"mapValue"in e}function __PRIVATE_isVectorValue(e){var t,r;return"__vector__"===(null===(r=((null===(t=null==e?void 0:e.mapValue)||void 0===t?void 0:t.fields)||{}).__type__)||void 0===r?void 0:r.stringValue)}function __PRIVATE_deepClone(e){if(e.geoPointValue)return{geoPointValue:Object.assign({},e.geoPointValue)};if(e.timestampValue&&"object"==typeof e.timestampValue)return{timestampValue:Object.assign({},e.timestampValue)};if(e.mapValue){let t={mapValue:{fields:{}}};return forEach(e.mapValue.fields,(e,r)=>t.mapValue.fields[e]=__PRIVATE_deepClone(r)),t}if(e.arrayValue){let t={arrayValue:{values:[]}};for(let r=0;r<(e.arrayValue.values||[]).length;++r)t.arrayValue.values[r]=__PRIVATE_deepClone(e.arrayValue.values[r]);return t}return Object.assign({},e)}function __PRIVATE_isMaxValue(e){return"__max__"===(((e.mapValue||{}).fields||{}).__type__||{}).stringValue}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let ObjectValue=class ObjectValue{constructor(e){this.value=e}static empty(){return new ObjectValue({mapValue:{}})}field(e){if(e.isEmpty())return this.value;{let t=this.value;for(let r=0;r<e.length-1;++r)if(!__PRIVATE_isMapValue(t=(t.mapValue.fields||{})[e.get(r)]))return null;return(t=(t.mapValue.fields||{})[e.lastSegment()])||null}}set(e,t){this.getFieldsMap(e.popLast())[e.lastSegment()]=__PRIVATE_deepClone(t)}setAll(e){let t=FieldPath$1.emptyPath(),r={},n=[];e.forEach((e,i)=>{if(!t.isImmediateParentOf(i)){let e=this.getFieldsMap(t);this.applyChanges(e,r,n),r={},n=[],t=i.popLast()}e?r[i.lastSegment()]=__PRIVATE_deepClone(e):n.push(i.lastSegment())});let i=this.getFieldsMap(t);this.applyChanges(i,r,n)}delete(e){let t=this.field(e.popLast());__PRIVATE_isMapValue(t)&&t.mapValue.fields&&delete t.mapValue.fields[e.lastSegment()]}isEqual(e){return __PRIVATE_valueEquals(this.value,e.value)}getFieldsMap(e){let t=this.value;t.mapValue.fields||(t.mapValue={fields:{}});for(let r=0;r<e.length;++r){let n=t.mapValue.fields[e.get(r)];__PRIVATE_isMapValue(n)&&n.mapValue.fields||(n={mapValue:{fields:{}}},t.mapValue.fields[e.get(r)]=n),t=n}return t.mapValue.fields}applyChanges(e,t,r){for(let n of(forEach(t,(t,r)=>e[t]=r),r))delete e[n]}clone(){return new ObjectValue(__PRIVATE_deepClone(this.value))}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let MutableDocument=class MutableDocument{constructor(e,t,r,n,i,s,a){this.key=e,this.documentType=t,this.version=r,this.readTime=n,this.createTime=i,this.data=s,this.documentState=a}static newInvalidDocument(e){return new MutableDocument(e,0,SnapshotVersion.min(),SnapshotVersion.min(),SnapshotVersion.min(),ObjectValue.empty(),0)}static newFoundDocument(e,t,r,n){return new MutableDocument(e,1,t,SnapshotVersion.min(),r,n,0)}static newNoDocument(e,t){return new MutableDocument(e,2,t,SnapshotVersion.min(),SnapshotVersion.min(),ObjectValue.empty(),0)}static newUnknownDocument(e,t){return new MutableDocument(e,3,t,SnapshotVersion.min(),SnapshotVersion.min(),ObjectValue.empty(),2)}convertToFoundDocument(e,t){return this.createTime.isEqual(SnapshotVersion.min())&&(2===this.documentType||0===this.documentType)&&(this.createTime=e),this.version=e,this.documentType=1,this.data=t,this.documentState=0,this}convertToNoDocument(e){return this.version=e,this.documentType=2,this.data=ObjectValue.empty(),this.documentState=0,this}convertToUnknownDocument(e){return this.version=e,this.documentType=3,this.data=ObjectValue.empty(),this.documentState=2,this}setHasCommittedMutations(){return this.documentState=2,this}setHasLocalMutations(){return this.documentState=1,this.version=SnapshotVersion.min(),this}setReadTime(e){return this.readTime=e,this}get hasLocalMutations(){return 1===this.documentState}get hasCommittedMutations(){return 2===this.documentState}get hasPendingWrites(){return this.hasLocalMutations||this.hasCommittedMutations}isValidDocument(){return 0!==this.documentType}isFoundDocument(){return 1===this.documentType}isNoDocument(){return 2===this.documentType}isUnknownDocument(){return 3===this.documentType}isEqual(e){return e instanceof MutableDocument&&this.key.isEqual(e.key)&&this.version.isEqual(e.version)&&this.documentType===e.documentType&&this.documentState===e.documentState&&this.data.isEqual(e.data)}mutableCopy(){return new MutableDocument(this.key,this.documentType,this.version,this.readTime,this.createTime,this.data.clone(),this.documentState)}toString(){return`Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {createTime: ${this.createTime}}), {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`}};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Bound=class Bound{constructor(e,t){this.position=e,this.inclusive=t}};function __PRIVATE_boundCompareToDocument(e,t,r){let n=0;for(let i=0;i<e.position.length;i++){let s=t[i],a=e.position[i];if(n=s.field.isKeyField()?DocumentKey.comparator(DocumentKey.fromName(a.referenceValue),r.key):__PRIVATE_valueCompare(a,r.data.field(s.field)),"desc"===s.dir&&(n*=-1),0!==n)break}return n}function __PRIVATE_boundEquals(e,t){if(null===e)return null===t;if(null===t||e.inclusive!==t.inclusive||e.position.length!==t.position.length)return!1;for(let r=0;r<e.position.length;r++)if(!__PRIVATE_valueEquals(e.position[r],t.position[r]))return!1;return!0}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let OrderBy=class OrderBy{constructor(e,t="asc"){this.field=e,this.dir=t}};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Filter=class Filter{};let FieldFilter=class FieldFilter extends Filter{constructor(e,t,r){super(),this.field=e,this.op=t,this.value=r}static create(e,t,r){return e.isKeyField()?"in"===t||"not-in"===t?this.createKeyFieldInFilter(e,t,r):new __PRIVATE_KeyFieldFilter(e,t,r):"array-contains"===t?new __PRIVATE_ArrayContainsFilter(e,r):"in"===t?new __PRIVATE_InFilter(e,r):"not-in"===t?new __PRIVATE_NotInFilter(e,r):"array-contains-any"===t?new __PRIVATE_ArrayContainsAnyFilter(e,r):new FieldFilter(e,t,r)}static createKeyFieldInFilter(e,t,r){return"in"===t?new __PRIVATE_KeyFieldInFilter(e,r):new __PRIVATE_KeyFieldNotInFilter(e,r)}matches(e){let t=e.data.field(this.field);return"!="===this.op?null!==t&&this.matchesComparison(__PRIVATE_valueCompare(t,this.value)):null!==t&&__PRIVATE_typeOrder(this.value)===__PRIVATE_typeOrder(t)&&this.matchesComparison(__PRIVATE_valueCompare(t,this.value))}matchesComparison(e){switch(this.op){case"<":return e<0;case"<=":return e<=0;case"==":return 0===e;case"!=":return 0!==e;case">":return e>0;case">=":return e>=0;default:return fail()}}isInequality(){return["<","<=",">",">=","!=","not-in"].indexOf(this.op)>=0}getFlattenedFilters(){return[this]}getFilters(){return[this]}};let CompositeFilter=class CompositeFilter extends Filter{constructor(e,t){super(),this.filters=e,this.op=t,this.ae=null}static create(e,t){return new CompositeFilter(e,t)}matches(e){return __PRIVATE_compositeFilterIsConjunction(this)?void 0===this.filters.find(t=>!t.matches(e)):void 0!==this.filters.find(t=>t.matches(e))}getFlattenedFilters(){return null!==this.ae||(this.ae=this.filters.reduce((e,t)=>e.concat(t.getFlattenedFilters()),[])),this.ae}getFilters(){return Object.assign([],this.filters)}};function __PRIVATE_compositeFilterIsConjunction(e){return"and"===e.op}function __PRIVATE_compositeFilterIsFlat(e){for(let t of e.filters)if(t instanceof CompositeFilter)return!1;return!0}let __PRIVATE_KeyFieldFilter=class __PRIVATE_KeyFieldFilter extends FieldFilter{constructor(e,t,r){super(e,t,r),this.key=DocumentKey.fromName(r.referenceValue)}matches(e){let t=DocumentKey.comparator(e.key,this.key);return this.matchesComparison(t)}};let __PRIVATE_KeyFieldInFilter=class __PRIVATE_KeyFieldInFilter extends FieldFilter{constructor(e,t){super(e,"in",t),this.keys=__PRIVATE_extractDocumentKeysFromArrayValue("in",t)}matches(e){return this.keys.some(t=>t.isEqual(e.key))}};let __PRIVATE_KeyFieldNotInFilter=class __PRIVATE_KeyFieldNotInFilter extends FieldFilter{constructor(e,t){super(e,"not-in",t),this.keys=__PRIVATE_extractDocumentKeysFromArrayValue("not-in",t)}matches(e){return!this.keys.some(t=>t.isEqual(e.key))}};function __PRIVATE_extractDocumentKeysFromArrayValue(e,t){var r;return((null===(r=t.arrayValue)||void 0===r?void 0:r.values)||[]).map(e=>DocumentKey.fromName(e.referenceValue))}let __PRIVATE_ArrayContainsFilter=class __PRIVATE_ArrayContainsFilter extends FieldFilter{constructor(e,t){super(e,"array-contains",t)}matches(e){let t=e.data.field(this.field);return isArray(t)&&__PRIVATE_arrayValueContains(t.arrayValue,this.value)}};let __PRIVATE_InFilter=class __PRIVATE_InFilter extends FieldFilter{constructor(e,t){super(e,"in",t)}matches(e){let t=e.data.field(this.field);return null!==t&&__PRIVATE_arrayValueContains(this.value.arrayValue,t)}};let __PRIVATE_NotInFilter=class __PRIVATE_NotInFilter extends FieldFilter{constructor(e,t){super(e,"not-in",t)}matches(e){if(__PRIVATE_arrayValueContains(this.value.arrayValue,{nullValue:"NULL_VALUE"}))return!1;let t=e.data.field(this.field);return null!==t&&!__PRIVATE_arrayValueContains(this.value.arrayValue,t)}};let __PRIVATE_ArrayContainsAnyFilter=class __PRIVATE_ArrayContainsAnyFilter extends FieldFilter{constructor(e,t){super(e,"array-contains-any",t)}matches(e){let t=e.data.field(this.field);return!(!isArray(t)||!t.arrayValue.values)&&t.arrayValue.values.some(e=>__PRIVATE_arrayValueContains(this.value.arrayValue,e))}};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_TargetImpl=class __PRIVATE_TargetImpl{constructor(e,t=null,r=[],n=[],i=null,s=null,a=null){this.path=e,this.collectionGroup=t,this.orderBy=r,this.filters=n,this.limit=i,this.startAt=s,this.endAt=a,this.ue=null}};function __PRIVATE_newTarget(e,t=null,r=[],n=[],i=null,s=null,a=null){return new __PRIVATE_TargetImpl(e,t,r,n,i,s,a)}function __PRIVATE_canonifyTarget(e){if(null===e.ue){let t=e.path.canonicalString();null!==e.collectionGroup&&(t+="|cg:"+e.collectionGroup),t+="|f:"+e.filters.map(e=>(function __PRIVATE_canonifyFilter(e){if(e instanceof FieldFilter)return e.field.canonicalString()+e.op.toString()+__PRIVATE_canonifyValue(e.value);if(__PRIVATE_compositeFilterIsFlat(e)&&__PRIVATE_compositeFilterIsConjunction(e))return e.filters.map(e=>__PRIVATE_canonifyFilter(e)).join(",");{let t=e.filters.map(e=>__PRIVATE_canonifyFilter(e)).join(",");return`${e.op}(${t})`}})(e)).join(",")+"|ob:"+e.orderBy.map(e=>e.field.canonicalString()+e.dir).join(","),null==e.limit||(t+="|l:"+e.limit),e.startAt&&(t+="|lb:"+(e.startAt.inclusive?"b:":"a:")+e.startAt.position.map(e=>__PRIVATE_canonifyValue(e)).join(",")),e.endAt&&(t+="|ub:"+(e.endAt.inclusive?"a:":"b:")+e.endAt.position.map(e=>__PRIVATE_canonifyValue(e)).join(",")),e.ue=t}return e.ue}function __PRIVATE_targetEquals(e,t){if(e.limit!==t.limit||e.orderBy.length!==t.orderBy.length)return!1;for(let i=0;i<e.orderBy.length;i++){var r,n;if(r=e.orderBy[i],n=t.orderBy[i],!(r.dir===n.dir&&r.field.isEqual(n.field)))return!1}if(e.filters.length!==t.filters.length)return!1;for(let r=0;r<e.filters.length;r++)if(!function __PRIVATE_filterEquals(e,t){return e instanceof FieldFilter?t instanceof FieldFilter&&e.op===t.op&&e.field.isEqual(t.field)&&__PRIVATE_valueEquals(e.value,t.value):e instanceof CompositeFilter?t instanceof CompositeFilter&&e.op===t.op&&e.filters.length===t.filters.length&&e.filters.reduce((e,r,n)=>e&&__PRIVATE_filterEquals(r,t.filters[n]),!0):void fail()}(e.filters[r],t.filters[r]))return!1;return e.collectionGroup===t.collectionGroup&&!!e.path.isEqual(t.path)&&!!__PRIVATE_boundEquals(e.startAt,t.startAt)&&__PRIVATE_boundEquals(e.endAt,t.endAt)}function __PRIVATE_targetIsDocumentTarget(e){return DocumentKey.isDocumentKey(e.path)&&null===e.collectionGroup&&0===e.filters.length}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_QueryImpl=class __PRIVATE_QueryImpl{constructor(e,t=null,r=[],n=[],i=null,s="F",a=null,o=null){this.path=e,this.collectionGroup=t,this.explicitOrderBy=r,this.filters=n,this.limit=i,this.limitType=s,this.startAt=a,this.endAt=o,this.ce=null,this.le=null,this.he=null,this.startAt,this.endAt}};function __PRIVATE_queryMatchesAllDocuments(e){return 0===e.filters.length&&null===e.limit&&null==e.startAt&&null==e.endAt&&(0===e.explicitOrderBy.length||1===e.explicitOrderBy.length&&e.explicitOrderBy[0].field.isKeyField())}function __PRIVATE_queryNormalizedOrderBy(e){if(null===e.ce){let t;e.ce=[];let r=new Set;for(let t of e.explicitOrderBy)e.ce.push(t),r.add(t.field.canonicalString());let n=e.explicitOrderBy.length>0?e.explicitOrderBy[e.explicitOrderBy.length-1].dir:"asc",i=(t=new SortedSet(FieldPath$1.comparator),e.filters.forEach(e=>{e.getFlattenedFilters().forEach(e=>{e.isInequality()&&(t=t.add(e.field))})}),t);i.forEach(t=>{r.has(t.canonicalString())||t.isKeyField()||e.ce.push(new OrderBy(t,n))}),r.has(FieldPath$1.keyField().canonicalString())||e.ce.push(new OrderBy(FieldPath$1.keyField(),n))}return e.ce}function __PRIVATE_queryToTarget(e){return e.le||(e.le=function(e,t){if("F"===e.limitType)return __PRIVATE_newTarget(e.path,e.collectionGroup,t,e.filters,e.limit,e.startAt,e.endAt);{t=t.map(e=>{let t="desc"===e.dir?"asc":"desc";return new OrderBy(e.field,t)});let r=e.endAt?new Bound(e.endAt.position,e.endAt.inclusive):null,n=e.startAt?new Bound(e.startAt.position,e.startAt.inclusive):null;return __PRIVATE_newTarget(e.path,e.collectionGroup,t,e.filters,e.limit,r,n)}}(e,__PRIVATE_queryNormalizedOrderBy(e))),e.le}function __PRIVATE_queryWithLimit(e,t,r){return new __PRIVATE_QueryImpl(e.path,e.collectionGroup,e.explicitOrderBy.slice(),e.filters.slice(),t,r,e.startAt,e.endAt)}function __PRIVATE_queryEquals(e,t){return __PRIVATE_targetEquals(__PRIVATE_queryToTarget(e),__PRIVATE_queryToTarget(t))&&e.limitType===t.limitType}function __PRIVATE_canonifyQuery(e){return`${__PRIVATE_canonifyTarget(__PRIVATE_queryToTarget(e))}|lt:${e.limitType}`}function __PRIVATE_stringifyQuery(e){var t;let r;return`Query(target=${r=(t=__PRIVATE_queryToTarget(e)).path.canonicalString(),null!==t.collectionGroup&&(r+=" collectionGroup="+t.collectionGroup),t.filters.length>0&&(r+=`, filters: [${t.filters.map(e=>(function __PRIVATE_stringifyFilter(e){return e instanceof FieldFilter?`${e.field.canonicalString()} ${e.op} ${__PRIVATE_canonifyValue(e.value)}`:e instanceof CompositeFilter?e.op.toString()+" {"+e.getFilters().map(__PRIVATE_stringifyFilter).join(" ,")+"}":"Filter"})(e)).join(", ")}]`),null==t.limit||(r+=", limit: "+t.limit),t.orderBy.length>0&&(r+=`, orderBy: [${t.orderBy.map(e=>`${e.field.canonicalString()} (${e.dir})`).join(", ")}]`),t.startAt&&(r+=", startAt: "+(t.startAt.inclusive?"b:":"a:")+t.startAt.position.map(e=>__PRIVATE_canonifyValue(e)).join(",")),t.endAt&&(r+=", endAt: "+(t.endAt.inclusive?"a:":"b:")+t.endAt.position.map(e=>__PRIVATE_canonifyValue(e)).join(",")),`Target(${r})`}; limitType=${e.limitType})`}function __PRIVATE_queryMatches(e,t){return t.isFoundDocument()&&function(e,t){let r=t.key.path;return null!==e.collectionGroup?t.key.hasCollectionId(e.collectionGroup)&&e.path.isPrefixOf(r):DocumentKey.isDocumentKey(e.path)?e.path.isEqual(r):e.path.isImmediateParentOf(r)}(e,t)&&function(e,t){for(let r of __PRIVATE_queryNormalizedOrderBy(e))if(!r.field.isKeyField()&&null===t.data.field(r.field))return!1;return!0}(e,t)&&function(e,t){for(let r of e.filters)if(!r.matches(t))return!1;return!0}(e,t)&&(!e.startAt||!!function(e,t,r){let n=__PRIVATE_boundCompareToDocument(e,t,r);return e.inclusive?n<=0:n<0}(e.startAt,__PRIVATE_queryNormalizedOrderBy(e),t))&&(!e.endAt||!!function(e,t,r){let n=__PRIVATE_boundCompareToDocument(e,t,r);return e.inclusive?n>=0:n>0}(e.endAt,__PRIVATE_queryNormalizedOrderBy(e),t))}function __PRIVATE_newQueryComparator(e){return(t,r)=>{let n=!1;for(let i of __PRIVATE_queryNormalizedOrderBy(e)){let e=function(e,t,r){let n=e.field.isKeyField()?DocumentKey.comparator(t.key,r.key):function(e,t,r){let n=t.data.field(e),i=r.data.field(e);return null!==n&&null!==i?__PRIVATE_valueCompare(n,i):fail()}(e.field,t,r);switch(e.dir){case"asc":return n;case"desc":return -1*n;default:return fail()}}(i,t,r);if(0!==e)return e;n=n||i.field.isKeyField()}return 0}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let ObjectMap=class ObjectMap{constructor(e,t){this.mapKeyFn=e,this.equalsFn=t,this.inner={},this.innerSize=0}get(e){let t=this.mapKeyFn(e),r=this.inner[t];if(void 0!==r){for(let[t,n]of r)if(this.equalsFn(t,e))return n}}has(e){return void 0!==this.get(e)}set(e,t){let r=this.mapKeyFn(e),n=this.inner[r];if(void 0===n)return this.inner[r]=[[e,t]],void this.innerSize++;for(let r=0;r<n.length;r++)if(this.equalsFn(n[r][0],e))return void(n[r]=[e,t]);n.push([e,t]),this.innerSize++}delete(e){let t=this.mapKeyFn(e),r=this.inner[t];if(void 0===r)return!1;for(let n=0;n<r.length;n++)if(this.equalsFn(r[n][0],e))return 1===r.length?delete this.inner[t]:r.splice(n,1),this.innerSize--,!0;return!1}forEach(e){forEach(this.inner,(t,r)=>{for(let[t,n]of r)e(t,n)})}isEmpty(){return isEmpty(this.inner)}size(){return this.innerSize}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let P=new SortedMap(DocumentKey.comparator),A=new SortedMap(DocumentKey.comparator);function documentMap(...e){let t=A;for(let r of e)t=t.insert(r.key,r);return t}function __PRIVATE_convertOverlayedDocumentMapToDocumentMap(e){let t=A;return e.forEach((e,r)=>t=t.insert(e,r.overlayedDocument)),t}function __PRIVATE_newDocumentKeyMap(){return new ObjectMap(e=>e.toString(),(e,t)=>e.isEqual(t))}let R=new SortedMap(DocumentKey.comparator),y=new SortedSet(DocumentKey.comparator);function __PRIVATE_documentKeySet(...e){let t=y;for(let r of e)t=t.add(r);return t}let V=new SortedSet(__PRIVATE_primitiveComparator);/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function __PRIVATE_toDouble(e,t){if(e.useProto3Json){if(isNaN(t))return{doubleValue:"NaN"};if(t===1/0)return{doubleValue:"Infinity"};if(t===-1/0)return{doubleValue:"-Infinity"}}return{doubleValue:__PRIVATE_isNegativeZero(t)?"-0":t}}function __PRIVATE_toInteger(e){return{integerValue:""+e}}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let TransformOperation=class TransformOperation{constructor(){this._=void 0}};function __PRIVATE_computeTransformOperationBaseValue(e,t){return e instanceof __PRIVATE_NumericIncrementTransformOperation?isInteger(t)||t&&"doubleValue"in t?t:{integerValue:0}:null}let __PRIVATE_ServerTimestampTransform=class __PRIVATE_ServerTimestampTransform extends TransformOperation{};let __PRIVATE_ArrayUnionTransformOperation=class __PRIVATE_ArrayUnionTransformOperation extends TransformOperation{constructor(e){super(),this.elements=e}};function __PRIVATE_applyArrayUnionTransformOperation(e,t){let r=__PRIVATE_coercedFieldValuesArray(t);for(let t of e.elements)r.some(e=>__PRIVATE_valueEquals(e,t))||r.push(t);return{arrayValue:{values:r}}}let __PRIVATE_ArrayRemoveTransformOperation=class __PRIVATE_ArrayRemoveTransformOperation extends TransformOperation{constructor(e){super(),this.elements=e}};function __PRIVATE_applyArrayRemoveTransformOperation(e,t){let r=__PRIVATE_coercedFieldValuesArray(t);for(let t of e.elements)r=r.filter(e=>!__PRIVATE_valueEquals(e,t));return{arrayValue:{values:r}}}let __PRIVATE_NumericIncrementTransformOperation=class __PRIVATE_NumericIncrementTransformOperation extends TransformOperation{constructor(e,t){super(),this.serializer=e,this.Pe=t}};function asNumber(e){return __PRIVATE_normalizeNumber(e.integerValue||e.doubleValue)}function __PRIVATE_coercedFieldValuesArray(e){return isArray(e)&&e.arrayValue.values?e.arrayValue.values.slice():[]}let MutationResult=class MutationResult{constructor(e,t){this.version=e,this.transformResults=t}};let Precondition=class Precondition{constructor(e,t){this.updateTime=e,this.exists=t}static none(){return new Precondition}static exists(e){return new Precondition(void 0,e)}static updateTime(e){return new Precondition(e)}get isNone(){return void 0===this.updateTime&&void 0===this.exists}isEqual(e){return this.exists===e.exists&&(this.updateTime?!!e.updateTime&&this.updateTime.isEqual(e.updateTime):!e.updateTime)}};function __PRIVATE_preconditionIsValidForDocument(e,t){return void 0!==e.updateTime?t.isFoundDocument()&&t.version.isEqual(e.updateTime):void 0===e.exists||e.exists===t.isFoundDocument()}let Mutation=class Mutation{};function __PRIVATE_calculateOverlayMutation(e,t){if(!e.hasLocalMutations||t&&0===t.fields.length)return null;if(null===t)return e.isNoDocument()?new __PRIVATE_DeleteMutation(e.key,Precondition.none()):new __PRIVATE_SetMutation(e.key,e.data,Precondition.none());{let r=e.data,n=ObjectValue.empty(),i=new SortedSet(FieldPath$1.comparator);for(let e of t.fields)if(!i.has(e)){let t=r.field(e);null===t&&e.length>1&&(e=e.popLast(),t=r.field(e)),null===t?n.delete(e):n.set(e,t),i=i.add(e)}return new __PRIVATE_PatchMutation(e.key,n,new FieldMask(i.toArray()),Precondition.none())}}function __PRIVATE_mutationApplyToLocalView(e,t,r,n){return e instanceof __PRIVATE_SetMutation?function(e,t,r,n){if(!__PRIVATE_preconditionIsValidForDocument(e.precondition,t))return r;let i=e.value.clone(),s=__PRIVATE_localTransformResults(e.fieldTransforms,n,t);return i.setAll(s),t.convertToFoundDocument(t.version,i).setHasLocalMutations(),null}(e,t,r,n):e instanceof __PRIVATE_PatchMutation?function(e,t,r,n){if(!__PRIVATE_preconditionIsValidForDocument(e.precondition,t))return r;let i=__PRIVATE_localTransformResults(e.fieldTransforms,n,t),s=t.data;return(s.setAll(__PRIVATE_getPatch(e)),s.setAll(i),t.convertToFoundDocument(t.version,s).setHasLocalMutations(),null===r)?null:r.unionWith(e.fieldMask.fields).unionWith(e.fieldTransforms.map(e=>e.field))}(e,t,r,n):__PRIVATE_preconditionIsValidForDocument(e.precondition,t)?(t.convertToNoDocument(t.version).setHasLocalMutations(),null):r}function __PRIVATE_mutationEquals(e,t){var r,n;return e.type===t.type&&!!e.key.isEqual(t.key)&&!!e.precondition.isEqual(t.precondition)&&(r=e.fieldTransforms,n=t.fieldTransforms,!!(void 0===r&&void 0===n||!(!r||!n)&&__PRIVATE_arrayEquals(r,n,(e,t)=>{var r,n;return e.field.isEqual(t.field)&&(r=e.transform,n=t.transform,r instanceof __PRIVATE_ArrayUnionTransformOperation&&n instanceof __PRIVATE_ArrayUnionTransformOperation||r instanceof __PRIVATE_ArrayRemoveTransformOperation&&n instanceof __PRIVATE_ArrayRemoveTransformOperation?__PRIVATE_arrayEquals(r.elements,n.elements,__PRIVATE_valueEquals):r instanceof __PRIVATE_NumericIncrementTransformOperation&&n instanceof __PRIVATE_NumericIncrementTransformOperation?__PRIVATE_valueEquals(r.Pe,n.Pe):r instanceof __PRIVATE_ServerTimestampTransform&&n instanceof __PRIVATE_ServerTimestampTransform)})))&&(0===e.type?e.value.isEqual(t.value):1!==e.type||e.data.isEqual(t.data)&&e.fieldMask.isEqual(t.fieldMask))}let __PRIVATE_SetMutation=class __PRIVATE_SetMutation extends Mutation{constructor(e,t,r,n=[]){super(),this.key=e,this.value=t,this.precondition=r,this.fieldTransforms=n,this.type=0}getFieldMask(){return null}};let __PRIVATE_PatchMutation=class __PRIVATE_PatchMutation extends Mutation{constructor(e,t,r,n,i=[]){super(),this.key=e,this.data=t,this.fieldMask=r,this.precondition=n,this.fieldTransforms=i,this.type=1}getFieldMask(){return this.fieldMask}};function __PRIVATE_getPatch(e){let t=new Map;return e.fieldMask.fields.forEach(r=>{if(!r.isEmpty()){let n=e.data.field(r);t.set(r,n)}}),t}function __PRIVATE_serverTransformResults(e,t,r){var n;let i=new Map;e.length===r.length||fail();for(let s=0;s<r.length;s++){let a=e[s],o=a.transform,l=t.data.field(a.field);i.set(a.field,(n=r[s],o instanceof __PRIVATE_ArrayUnionTransformOperation?__PRIVATE_applyArrayUnionTransformOperation(o,l):o instanceof __PRIVATE_ArrayRemoveTransformOperation?__PRIVATE_applyArrayRemoveTransformOperation(o,l):n))}return i}function __PRIVATE_localTransformResults(e,t,r){let n=new Map;for(let i of e){let e=i.transform,s=r.data.field(i.field);n.set(i.field,e instanceof __PRIVATE_ServerTimestampTransform?function(e,t){let r={fields:{__type__:{stringValue:"server_timestamp"},__local_write_time__:{timestampValue:{seconds:e.seconds,nanos:e.nanoseconds}}}};return t&&__PRIVATE_isServerTimestamp(t)&&(t=__PRIVATE_getPreviousValue(t)),t&&(r.fields.__previous_value__=t),{mapValue:r}}(t,s):e instanceof __PRIVATE_ArrayUnionTransformOperation?__PRIVATE_applyArrayUnionTransformOperation(e,s):e instanceof __PRIVATE_ArrayRemoveTransformOperation?__PRIVATE_applyArrayRemoveTransformOperation(e,s):function(e,t){let r=__PRIVATE_computeTransformOperationBaseValue(e,t),n=asNumber(r)+asNumber(e.Pe);return isInteger(r)&&isInteger(e.Pe)?__PRIVATE_toInteger(n):__PRIVATE_toDouble(e.serializer,n)}(e,s))}return n}let __PRIVATE_DeleteMutation=class __PRIVATE_DeleteMutation extends Mutation{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=2,this.fieldTransforms=[]}getFieldMask(){return null}};let __PRIVATE_VerifyMutation=class __PRIVATE_VerifyMutation extends Mutation{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=3,this.fieldTransforms=[]}getFieldMask(){return null}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let MutationBatch=class MutationBatch{constructor(e,t,r,n){this.batchId=e,this.localWriteTime=t,this.baseMutations=r,this.mutations=n}applyToRemoteDocument(e,t){let r=t.mutationResults;for(let t=0;t<this.mutations.length;t++){let i=this.mutations[t];if(i.key.isEqual(e.key)){var n;n=r[t],i instanceof __PRIVATE_SetMutation?function(e,t,r){let n=e.value.clone(),i=__PRIVATE_serverTransformResults(e.fieldTransforms,t,r.transformResults);n.setAll(i),t.convertToFoundDocument(r.version,n).setHasCommittedMutations()}(i,e,n):i instanceof __PRIVATE_PatchMutation?function(e,t,r){if(!__PRIVATE_preconditionIsValidForDocument(e.precondition,t))return void t.convertToUnknownDocument(r.version);let n=__PRIVATE_serverTransformResults(e.fieldTransforms,t,r.transformResults),i=t.data;i.setAll(__PRIVATE_getPatch(e)),i.setAll(n),t.convertToFoundDocument(r.version,i).setHasCommittedMutations()}(i,e,n):function(e,t,r){t.convertToNoDocument(r.version).setHasCommittedMutations()}(0,e,n)}}}applyToLocalView(e,t){for(let r of this.baseMutations)r.key.isEqual(e.key)&&(t=__PRIVATE_mutationApplyToLocalView(r,e,t,this.localWriteTime));for(let r of this.mutations)r.key.isEqual(e.key)&&(t=__PRIVATE_mutationApplyToLocalView(r,e,t,this.localWriteTime));return t}applyToLocalDocumentSet(e,t){let r=__PRIVATE_newDocumentKeyMap();return this.mutations.forEach(n=>{let i=e.get(n.key),s=i.overlayedDocument,a=this.applyToLocalView(s,i.mutatedFields);a=t.has(n.key)?null:a;let o=__PRIVATE_calculateOverlayMutation(s,a);null!==o&&r.set(n.key,o),s.isValidDocument()||s.convertToNoDocument(SnapshotVersion.min())}),r}keys(){return this.mutations.reduce((e,t)=>e.add(t.key),__PRIVATE_documentKeySet())}isEqual(e){return this.batchId===e.batchId&&__PRIVATE_arrayEquals(this.mutations,e.mutations,(e,t)=>__PRIVATE_mutationEquals(e,t))&&__PRIVATE_arrayEquals(this.baseMutations,e.baseMutations,(e,t)=>__PRIVATE_mutationEquals(e,t))}};let MutationBatchResult=class MutationBatchResult{constructor(e,t,r,n){this.batch=e,this.commitVersion=t,this.mutationResults=r,this.docVersions=n}static from(e,t,r){e.mutations.length===r.length||fail();let n=R,i=e.mutations;for(let e=0;e<i.length;e++)n=n.insert(i[e].key,r[e].version);return new MutationBatchResult(e,t,r,n)}};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Overlay=class Overlay{constructor(e,t){this.largestBatchId=e,this.mutation=t}getKey(){return this.mutation.key}isEqual(e){return null!==e&&this.mutation===e.mutation}toString(){return`Overlay{
      largestBatchId: ${this.largestBatchId},
      mutation: ${this.mutation.toString()}
    }`}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let ExistenceFilter=class ExistenceFilter{constructor(e,t){this.count=e,this.unchangedNames=t}};function __PRIVATE_mapCodeFromRpcCode(e){if(void 0===e)return __PRIVATE_logError("GRPC error has no .code"),p.UNKNOWN;switch(e){case n.OK:return p.OK;case n.CANCELLED:return p.CANCELLED;case n.UNKNOWN:return p.UNKNOWN;case n.DEADLINE_EXCEEDED:return p.DEADLINE_EXCEEDED;case n.RESOURCE_EXHAUSTED:return p.RESOURCE_EXHAUSTED;case n.INTERNAL:return p.INTERNAL;case n.UNAVAILABLE:return p.UNAVAILABLE;case n.UNAUTHENTICATED:return p.UNAUTHENTICATED;case n.INVALID_ARGUMENT:return p.INVALID_ARGUMENT;case n.NOT_FOUND:return p.NOT_FOUND;case n.ALREADY_EXISTS:return p.ALREADY_EXISTS;case n.PERMISSION_DENIED:return p.PERMISSION_DENIED;case n.FAILED_PRECONDITION:return p.FAILED_PRECONDITION;case n.ABORTED:return p.ABORTED;case n.OUT_OF_RANGE:return p.OUT_OF_RANGE;case n.UNIMPLEMENTED:return p.UNIMPLEMENTED;case n.DATA_LOSS:return p.DATA_LOSS;default:return fail()}}(i=n||(n={}))[i.OK=0]="OK",i[i.CANCELLED=1]="CANCELLED",i[i.UNKNOWN=2]="UNKNOWN",i[i.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",i[i.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",i[i.NOT_FOUND=5]="NOT_FOUND",i[i.ALREADY_EXISTS=6]="ALREADY_EXISTS",i[i.PERMISSION_DENIED=7]="PERMISSION_DENIED",i[i.UNAUTHENTICATED=16]="UNAUTHENTICATED",i[i.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",i[i.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",i[i.ABORTED=10]="ABORTED",i[i.OUT_OF_RANGE=11]="OUT_OF_RANGE",i[i.UNIMPLEMENTED=12]="UNIMPLEMENTED",i[i.INTERNAL=13]="INTERNAL",i[i.UNAVAILABLE=14]="UNAVAILABLE",i[i.DATA_LOSS=15]="DATA_LOSS";/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let v=new _.z8([4294967295,4294967295],0);function __PRIVATE_getMd5HashValue(e){let t=(new TextEncoder).encode(e),r=new _.V8;return r.update(t),new Uint8Array(r.digest())}function __PRIVATE_get64BitUints(e){let t=new DataView(e.buffer),r=t.getUint32(0,!0),n=t.getUint32(4,!0),i=t.getUint32(8,!0),s=t.getUint32(12,!0);return[new _.z8([r,n],0),new _.z8([i,s],0)]}let BloomFilter=class BloomFilter{constructor(e,t,r){if(this.bitmap=e,this.padding=t,this.hashCount=r,t<0||t>=8)throw new __PRIVATE_BloomFilterError(`Invalid padding: ${t}`);if(r<0||e.length>0&&0===this.hashCount)throw new __PRIVATE_BloomFilterError(`Invalid hash count: ${r}`);if(0===e.length&&0!==t)throw new __PRIVATE_BloomFilterError(`Invalid padding when bitmap length is 0: ${t}`);this.Ie=8*e.length-t,this.Te=_.z8.fromNumber(this.Ie)}Ee(e,t,r){let n=e.add(t.multiply(_.z8.fromNumber(r)));return 1===n.compare(v)&&(n=new _.z8([n.getBits(0),n.getBits(1)],0)),n.modulo(this.Te).toNumber()}de(e){return 0!=(this.bitmap[Math.floor(e/8)]&1<<e%8)}mightContain(e){if(0===this.Ie)return!1;let t=__PRIVATE_getMd5HashValue(e),[r,n]=__PRIVATE_get64BitUints(t);for(let e=0;e<this.hashCount;e++){let t=this.Ee(r,n,e);if(!this.de(t))return!1}return!0}static create(e,t,r){let n=new Uint8Array(Math.ceil(e/8)),i=new BloomFilter(n,e%8==0?0:8-e%8,t);return r.forEach(e=>i.insert(e)),i}insert(e){if(0===this.Ie)return;let t=__PRIVATE_getMd5HashValue(e),[r,n]=__PRIVATE_get64BitUints(t);for(let e=0;e<this.hashCount;e++){let t=this.Ee(r,n,e);this.Ae(t)}}Ae(e){this.bitmap[Math.floor(e/8)]|=1<<e%8}};let __PRIVATE_BloomFilterError=class __PRIVATE_BloomFilterError extends Error{constructor(){super(...arguments),this.name="BloomFilterError"}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let RemoteEvent=class RemoteEvent{constructor(e,t,r,n,i){this.snapshotVersion=e,this.targetChanges=t,this.targetMismatches=r,this.documentUpdates=n,this.resolvedLimboDocuments=i}static createSynthesizedRemoteEventForCurrentChange(e,t,r){let n=new Map;return n.set(e,TargetChange.createSynthesizedTargetChangeForCurrentChange(e,t,r)),new RemoteEvent(SnapshotVersion.min(),n,new SortedMap(__PRIVATE_primitiveComparator),P,__PRIVATE_documentKeySet())}};let TargetChange=class TargetChange{constructor(e,t,r,n,i){this.resumeToken=e,this.current=t,this.addedDocuments=r,this.modifiedDocuments=n,this.removedDocuments=i}static createSynthesizedTargetChangeForCurrentChange(e,t,r){return new TargetChange(r,t,__PRIVATE_documentKeySet(),__PRIVATE_documentKeySet(),__PRIVATE_documentKeySet())}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_DocumentWatchChange=class __PRIVATE_DocumentWatchChange{constructor(e,t,r,n){this.Re=e,this.removedTargetIds=t,this.key=r,this.Ve=n}};let __PRIVATE_ExistenceFilterChange=class __PRIVATE_ExistenceFilterChange{constructor(e,t){this.targetId=e,this.me=t}};let __PRIVATE_WatchTargetChange=class __PRIVATE_WatchTargetChange{constructor(e,t,r=ByteString.EMPTY_BYTE_STRING,n=null){this.state=e,this.targetIds=t,this.resumeToken=r,this.cause=n}};let __PRIVATE_TargetState=class __PRIVATE_TargetState{constructor(){this.fe=0,this.ge=__PRIVATE_snapshotChangesMap(),this.pe=ByteString.EMPTY_BYTE_STRING,this.ye=!1,this.we=!0}get current(){return this.ye}get resumeToken(){return this.pe}get Se(){return 0!==this.fe}get be(){return this.we}De(e){e.approximateByteSize()>0&&(this.we=!0,this.pe=e)}ve(){let e=__PRIVATE_documentKeySet(),t=__PRIVATE_documentKeySet(),r=__PRIVATE_documentKeySet();return this.ge.forEach((n,i)=>{switch(i){case 0:e=e.add(n);break;case 2:t=t.add(n);break;case 1:r=r.add(n);break;default:fail()}}),new TargetChange(this.pe,this.ye,e,t,r)}Ce(){this.we=!1,this.ge=__PRIVATE_snapshotChangesMap()}Fe(e,t){this.we=!0,this.ge=this.ge.insert(e,t)}Me(e){this.we=!0,this.ge=this.ge.remove(e)}xe(){this.fe+=1}Oe(){this.fe-=1,this.fe>=0||fail()}Ne(){this.we=!0,this.ye=!0}};let __PRIVATE_WatchChangeAggregator=class __PRIVATE_WatchChangeAggregator{constructor(e){this.Le=e,this.Be=new Map,this.ke=P,this.qe=__PRIVATE_documentTargetMap(),this.Qe=new SortedMap(__PRIVATE_primitiveComparator)}Ke(e){for(let t of e.Re)e.Ve&&e.Ve.isFoundDocument()?this.$e(t,e.Ve):this.Ue(t,e.key,e.Ve);for(let t of e.removedTargetIds)this.Ue(t,e.key,e.Ve)}We(e){this.forEachTarget(e,t=>{let r=this.Ge(t);switch(e.state){case 0:this.ze(t)&&r.De(e.resumeToken);break;case 1:r.Oe(),r.Se||r.Ce(),r.De(e.resumeToken);break;case 2:r.Oe(),r.Se||this.removeTarget(t);break;case 3:this.ze(t)&&(r.Ne(),r.De(e.resumeToken));break;case 4:this.ze(t)&&(this.je(t),r.De(e.resumeToken));break;default:fail()}})}forEachTarget(e,t){e.targetIds.length>0?e.targetIds.forEach(t):this.Be.forEach((e,r)=>{this.ze(r)&&t(r)})}He(e){let t=e.targetId,r=e.me.count,n=this.Je(t);if(n){let i=n.target;if(__PRIVATE_targetIsDocumentTarget(i)){if(0===r){let e=new DocumentKey(i.path);this.Ue(t,e,MutableDocument.newNoDocument(e,SnapshotVersion.min()))}else 1===r||fail()}else{let n=this.Ye(t);if(n!==r){let r=this.Ze(e),i=r?this.Xe(r,e,n):1;0!==i&&(this.je(t),this.Qe=this.Qe.insert(t,2===i?"TargetPurposeExistenceFilterMismatchBloom":"TargetPurposeExistenceFilterMismatch"))}}}}Ze(e){let t,r;let n=e.me.unchangedNames;if(!n||!n.bits)return null;let{bits:{bitmap:i="",padding:s=0},hashCount:a=0}=n;try{t=__PRIVATE_normalizeByteString(i).toUint8Array()}catch(e){if(e instanceof __PRIVATE_Base64DecodeError)return __PRIVATE_logWarn("Decoding the base64 bloom filter in existence filter failed ("+e.message+"); ignoring the bloom filter and falling back to full re-query."),null;throw e}try{r=new BloomFilter(t,s,a)}catch(e){return __PRIVATE_logWarn(e instanceof __PRIVATE_BloomFilterError?"BloomFilter error: ":"Applying bloom filter failed: ",e),null}return 0===r.Ie?null:r}Xe(e,t,r){return t.me.count===r-this.nt(e,t.targetId)?0:2}nt(e,t){let r=this.Le.getRemoteKeysForTarget(t),n=0;return r.forEach(r=>{let i=this.Le.tt(),s=`projects/${i.projectId}/databases/${i.database}/documents/${r.path.canonicalString()}`;e.mightContain(s)||(this.Ue(t,r,null),n++)}),n}rt(e){let t=new Map;this.Be.forEach((r,n)=>{let i=this.Je(n);if(i){if(r.current&&__PRIVATE_targetIsDocumentTarget(i.target)){let t=new DocumentKey(i.target.path);null!==this.ke.get(t)||this.it(n,t)||this.Ue(n,t,MutableDocument.newNoDocument(t,e))}r.be&&(t.set(n,r.ve()),r.Ce())}});let r=__PRIVATE_documentKeySet();this.qe.forEach((e,t)=>{let n=!0;t.forEachWhile(e=>{let t=this.Je(e);return!t||"TargetPurposeLimboResolution"===t.purpose||(n=!1,!1)}),n&&(r=r.add(e))}),this.ke.forEach((t,r)=>r.setReadTime(e));let n=new RemoteEvent(e,t,this.Qe,this.ke,r);return this.ke=P,this.qe=__PRIVATE_documentTargetMap(),this.Qe=new SortedMap(__PRIVATE_primitiveComparator),n}$e(e,t){if(!this.ze(e))return;let r=this.it(e,t.key)?2:0;this.Ge(e).Fe(t.key,r),this.ke=this.ke.insert(t.key,t),this.qe=this.qe.insert(t.key,this.st(t.key).add(e))}Ue(e,t,r){if(!this.ze(e))return;let n=this.Ge(e);this.it(e,t)?n.Fe(t,1):n.Me(t),this.qe=this.qe.insert(t,this.st(t).delete(e)),r&&(this.ke=this.ke.insert(t,r))}removeTarget(e){this.Be.delete(e)}Ye(e){let t=this.Ge(e).ve();return this.Le.getRemoteKeysForTarget(e).size+t.addedDocuments.size-t.removedDocuments.size}xe(e){this.Ge(e).xe()}Ge(e){let t=this.Be.get(e);return t||(t=new __PRIVATE_TargetState,this.Be.set(e,t)),t}st(e){let t=this.qe.get(e);return t||(t=new SortedSet(__PRIVATE_primitiveComparator),this.qe=this.qe.insert(e,t)),t}ze(e){let t=null!==this.Je(e);return t||__PRIVATE_logDebug("WatchChangeAggregator","Detected inactive target",e),t}Je(e){let t=this.Be.get(e);return t&&t.Se?null:this.Le.ot(e)}je(e){this.Be.set(e,new __PRIVATE_TargetState),this.Le.getRemoteKeysForTarget(e).forEach(t=>{this.Ue(e,t,null)})}it(e,t){return this.Le.getRemoteKeysForTarget(e).has(t)}};function __PRIVATE_documentTargetMap(){return new SortedMap(DocumentKey.comparator)}function __PRIVATE_snapshotChangesMap(){return new SortedMap(DocumentKey.comparator)}let S={asc:"ASCENDING",desc:"DESCENDING"},w={"<":"LESS_THAN","<=":"LESS_THAN_OR_EQUAL",">":"GREATER_THAN",">=":"GREATER_THAN_OR_EQUAL","==":"EQUAL","!=":"NOT_EQUAL","array-contains":"ARRAY_CONTAINS",in:"IN","not-in":"NOT_IN","array-contains-any":"ARRAY_CONTAINS_ANY"},C={and:"AND",or:"OR"};let JsonProtoSerializer=class JsonProtoSerializer{constructor(e,t){this.databaseId=e,this.useProto3Json=t}};function __PRIVATE_toInt32Proto(e,t){return e.useProto3Json||null==t?t:{value:t}}function toTimestamp(e,t){return e.useProto3Json?`${new Date(1e3*t.seconds).toISOString().replace(/\.\d*/,"").replace("Z","")}.${("000000000"+t.nanoseconds).slice(-9)}Z`:{seconds:""+t.seconds,nanos:t.nanoseconds}}function __PRIVATE_toBytes(e,t){return e.useProto3Json?t.toBase64():t.toUint8Array()}function __PRIVATE_fromVersion(e){return e||fail(),SnapshotVersion.fromTimestamp(function(e){let t=__PRIVATE_normalizeTimestamp(e);return new Timestamp(t.seconds,t.nanos)}(e))}function __PRIVATE_toResourceName(e,t){return __PRIVATE_toResourcePath(e,t).canonicalString()}function __PRIVATE_toResourcePath(e,t){let r=new ResourcePath(["projects",e.projectId,"databases",e.database]).child("documents");return void 0===t?r:r.child(t)}function __PRIVATE_fromResourceName(e){let t=ResourcePath.fromString(e);return __PRIVATE_isValidResourceName(t)||fail(),t}function __PRIVATE_toName(e,t){return __PRIVATE_toResourceName(e.databaseId,t.path)}function fromName(e,t){let r=__PRIVATE_fromResourceName(t);if(r.get(1)!==e.databaseId.projectId)throw new FirestoreError(p.INVALID_ARGUMENT,"Tried to deserialize key from different project: "+r.get(1)+" vs "+e.databaseId.projectId);if(r.get(3)!==e.databaseId.database)throw new FirestoreError(p.INVALID_ARGUMENT,"Tried to deserialize key from different database: "+r.get(3)+" vs "+e.databaseId.database);return new DocumentKey(__PRIVATE_extractLocalPathFromResourceName(r))}function __PRIVATE_toQueryPath(e,t){return __PRIVATE_toResourceName(e.databaseId,t)}function __PRIVATE_getEncodedDatabaseId(e){return new ResourcePath(["projects",e.databaseId.projectId,"databases",e.databaseId.database]).canonicalString()}function __PRIVATE_extractLocalPathFromResourceName(e){return e.length>4&&"documents"===e.get(4)||fail(),e.popFirst(5)}function __PRIVATE_toMutationDocument(e,t,r){return{name:__PRIVATE_toName(e,t),fields:r.value.mapValue.fields}}function __PRIVATE_toFieldPathReference(e){return{fieldPath:e.canonicalString()}}function __PRIVATE_fromFieldPathReference(e){return FieldPath$1.fromServerFormat(e.fieldPath)}function __PRIVATE_isValidResourceName(e){return e.length>=4&&"projects"===e.get(0)&&"databases"===e.get(2)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let TargetData=class TargetData{constructor(e,t,r,n,i=SnapshotVersion.min(),s=SnapshotVersion.min(),a=ByteString.EMPTY_BYTE_STRING,o=null){this.target=e,this.targetId=t,this.purpose=r,this.sequenceNumber=n,this.snapshotVersion=i,this.lastLimboFreeSnapshotVersion=s,this.resumeToken=a,this.expectedCount=o}withSequenceNumber(e){return new TargetData(this.target,this.targetId,this.purpose,e,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,this.expectedCount)}withResumeToken(e,t){return new TargetData(this.target,this.targetId,this.purpose,this.sequenceNumber,t,this.lastLimboFreeSnapshotVersion,e,null)}withExpectedCount(e){return new TargetData(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,e)}withLastLimboFreeSnapshotVersion(e){return new TargetData(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,e,this.resumeToken,this.expectedCount)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_LocalSerializer=class __PRIVATE_LocalSerializer{constructor(e){this.ct=e}};/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_FirestoreIndexValueWriter=class __PRIVATE_FirestoreIndexValueWriter{constructor(){}It(e,t){this.Tt(e,t),t.Et()}Tt(e,t){if("nullValue"in e)this.dt(t,5);else if("booleanValue"in e)this.dt(t,10),t.At(e.booleanValue?1:0);else if("integerValue"in e)this.dt(t,15),t.At(__PRIVATE_normalizeNumber(e.integerValue));else if("doubleValue"in e){let r=__PRIVATE_normalizeNumber(e.doubleValue);isNaN(r)?this.dt(t,13):(this.dt(t,15),__PRIVATE_isNegativeZero(r)?t.At(0):t.At(r))}else if("timestampValue"in e){let r=e.timestampValue;this.dt(t,20),"string"==typeof r&&(r=__PRIVATE_normalizeTimestamp(r)),t.Rt(`${r.seconds||""}`),t.At(r.nanos||0)}else if("stringValue"in e)this.Vt(e.stringValue,t),this.ft(t);else if("bytesValue"in e)this.dt(t,30),t.gt(__PRIVATE_normalizeByteString(e.bytesValue)),this.ft(t);else if("referenceValue"in e)this.yt(e.referenceValue,t);else if("geoPointValue"in e){let r=e.geoPointValue;this.dt(t,45),t.At(r.latitude||0),t.At(r.longitude||0)}else"mapValue"in e?__PRIVATE_isMaxValue(e)?this.dt(t,Number.MAX_SAFE_INTEGER):__PRIVATE_isVectorValue(e)?this.wt(e.mapValue,t):(this.St(e.mapValue,t),this.ft(t)):"arrayValue"in e?(this.bt(e.arrayValue,t),this.ft(t)):fail()}Vt(e,t){this.dt(t,25),this.Dt(e,t)}Dt(e,t){t.Rt(e)}St(e,t){let r=e.fields||{};for(let e of(this.dt(t,55),Object.keys(r)))this.Vt(e,t),this.Tt(r[e],t)}wt(e,t){var r,n;let i=e.fields||{};this.dt(t,53);let s="value",a=(null===(n=null===(r=i[s].arrayValue)||void 0===r?void 0:r.values)||void 0===n?void 0:n.length)||0;this.dt(t,15),t.At(__PRIVATE_normalizeNumber(a)),this.Vt(s,t),this.Tt(i[s],t)}bt(e,t){let r=e.values||[];for(let e of(this.dt(t,50),r))this.Tt(e,t)}yt(e,t){this.dt(t,37),DocumentKey.fromName(e).path.forEach(e=>{this.dt(t,60),this.Dt(e,t)})}dt(e,t){e.At(t)}ft(e){e.At(2)}};__PRIVATE_FirestoreIndexValueWriter.vt=new __PRIVATE_FirestoreIndexValueWriter;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryIndexManager=class __PRIVATE_MemoryIndexManager{constructor(){this.un=new __PRIVATE_MemoryCollectionParentIndex}addToCollectionParentIndex(e,t){return this.un.add(t),PersistencePromise.resolve()}getCollectionParents(e,t){return PersistencePromise.resolve(this.un.getEntries(t))}addFieldIndex(e,t){return PersistencePromise.resolve()}deleteFieldIndex(e,t){return PersistencePromise.resolve()}deleteAllFieldIndexes(e){return PersistencePromise.resolve()}createTargetIndexes(e,t){return PersistencePromise.resolve()}getDocumentsMatchingTarget(e,t){return PersistencePromise.resolve(null)}getIndexType(e,t){return PersistencePromise.resolve(0)}getFieldIndexes(e,t){return PersistencePromise.resolve([])}getNextCollectionGroupToUpdate(e){return PersistencePromise.resolve(null)}getMinOffset(e,t){return PersistencePromise.resolve(IndexOffset.min())}getMinOffsetFromCollectionGroup(e,t){return PersistencePromise.resolve(IndexOffset.min())}updateCollectionGroup(e,t,r){return PersistencePromise.resolve()}updateIndexEntries(e,t){return PersistencePromise.resolve()}};let __PRIVATE_MemoryCollectionParentIndex=class __PRIVATE_MemoryCollectionParentIndex{constructor(){this.index={}}add(e){let t=e.lastSegment(),r=e.popLast(),n=this.index[t]||new SortedSet(ResourcePath.comparator),i=!n.has(r);return this.index[t]=n.add(r),i}has(e){let t=e.lastSegment(),r=e.popLast(),n=this.index[t];return n&&n.has(r)}getEntries(e){return(this.index[e]||new SortedSet(ResourcePath.comparator)).toArray()}};new Uint8Array(0);let LruParams=class LruParams{constructor(e,t,r){this.cacheSizeCollectionThreshold=e,this.percentileToCollect=t,this.maximumSequenceNumbersToCollect=r}static withCacheSize(e){return new LruParams(e,LruParams.DEFAULT_COLLECTION_PERCENTILE,LruParams.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */LruParams.DEFAULT_COLLECTION_PERCENTILE=10,LruParams.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT=1e3,LruParams.DEFAULT=new LruParams(41943040,LruParams.DEFAULT_COLLECTION_PERCENTILE,LruParams.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT),LruParams.DISABLED=new LruParams(-1,0,0);/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_TargetIdGenerator=class __PRIVATE_TargetIdGenerator{constructor(e){this.Ln=e}next(){return this.Ln+=2,this.Ln}static Bn(){return new __PRIVATE_TargetIdGenerator(0)}static kn(){return new __PRIVATE_TargetIdGenerator(-1)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let RemoteDocumentChangeBuffer=class RemoteDocumentChangeBuffer{constructor(){this.changes=new ObjectMap(e=>e.toString(),(e,t)=>e.isEqual(t)),this.changesApplied=!1}addEntry(e){this.assertNotApplied(),this.changes.set(e.key,e)}removeEntry(e,t){this.assertNotApplied(),this.changes.set(e,MutableDocument.newInvalidDocument(e).setReadTime(t))}getEntry(e,t){this.assertNotApplied();let r=this.changes.get(t);return void 0!==r?PersistencePromise.resolve(r):this.getFromCache(e,t)}getEntries(e,t){return this.getAllFromCache(e,t)}apply(e){return this.assertNotApplied(),this.changesApplied=!0,this.applyChanges(e)}assertNotApplied(){}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let OverlayedDocument=class OverlayedDocument{constructor(e,t){this.overlayedDocument=e,this.mutatedFields=t}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let LocalDocumentsView=class LocalDocumentsView{constructor(e,t,r,n){this.remoteDocumentCache=e,this.mutationQueue=t,this.documentOverlayCache=r,this.indexManager=n}getDocument(e,t){let r=null;return this.documentOverlayCache.getOverlay(e,t).next(n=>(r=n,this.remoteDocumentCache.getEntry(e,t))).next(e=>(null!==r&&__PRIVATE_mutationApplyToLocalView(r.mutation,e,FieldMask.empty(),Timestamp.now()),e))}getDocuments(e,t){return this.remoteDocumentCache.getEntries(e,t).next(t=>this.getLocalViewOfDocuments(e,t,__PRIVATE_documentKeySet()).next(()=>t))}getLocalViewOfDocuments(e,t,r=__PRIVATE_documentKeySet()){let n=__PRIVATE_newDocumentKeyMap();return this.populateOverlays(e,n,t).next(()=>this.computeViews(e,t,n,r).next(e=>{let t=documentMap();return e.forEach((e,r)=>{t=t.insert(e,r.overlayedDocument)}),t}))}getOverlayedDocuments(e,t){let r=__PRIVATE_newDocumentKeyMap();return this.populateOverlays(e,r,t).next(()=>this.computeViews(e,t,r,__PRIVATE_documentKeySet()))}populateOverlays(e,t,r){let n=[];return r.forEach(e=>{t.has(e)||n.push(e)}),this.documentOverlayCache.getOverlays(e,n).next(e=>{e.forEach((e,r)=>{t.set(e,r)})})}computeViews(e,t,r,n){let i=P,s=__PRIVATE_newDocumentKeyMap(),a=__PRIVATE_newDocumentKeyMap();return t.forEach((e,t)=>{let a=r.get(t.key);n.has(t.key)&&(void 0===a||a.mutation instanceof __PRIVATE_PatchMutation)?i=i.insert(t.key,t):void 0!==a?(s.set(t.key,a.mutation.getFieldMask()),__PRIVATE_mutationApplyToLocalView(a.mutation,t,a.mutation.getFieldMask(),Timestamp.now())):s.set(t.key,FieldMask.empty())}),this.recalculateAndSaveOverlays(e,i).next(e=>(e.forEach((e,t)=>s.set(e,t)),t.forEach((e,t)=>{var r;return a.set(e,new OverlayedDocument(t,null!==(r=s.get(e))&&void 0!==r?r:null))}),a))}recalculateAndSaveOverlays(e,t){let r=__PRIVATE_newDocumentKeyMap(),n=new SortedMap((e,t)=>e-t),i=__PRIVATE_documentKeySet();return this.mutationQueue.getAllMutationBatchesAffectingDocumentKeys(e,t).next(e=>{for(let i of e)i.keys().forEach(e=>{let s=t.get(e);if(null===s)return;let a=r.get(e)||FieldMask.empty();a=i.applyToLocalView(s,a),r.set(e,a);let o=(n.get(i.batchId)||__PRIVATE_documentKeySet()).add(e);n=n.insert(i.batchId,o)})}).next(()=>{let s=[],a=n.getReverseIterator();for(;a.hasNext();){let n=a.getNext(),o=n.key,l=n.value,u=__PRIVATE_newDocumentKeyMap();l.forEach(e=>{if(!i.has(e)){let n=__PRIVATE_calculateOverlayMutation(t.get(e),r.get(e));null!==n&&u.set(e,n),i=i.add(e)}}),s.push(this.documentOverlayCache.saveOverlays(e,o,u))}return PersistencePromise.waitFor(s)}).next(()=>r)}recalculateAndSaveOverlaysForDocumentKeys(e,t){return this.remoteDocumentCache.getEntries(e,t).next(t=>this.recalculateAndSaveOverlays(e,t))}getDocumentsMatchingQuery(e,t,r,n){return DocumentKey.isDocumentKey(t.path)&&null===t.collectionGroup&&0===t.filters.length?this.getDocumentsMatchingDocumentQuery(e,t.path):null!==t.collectionGroup?this.getDocumentsMatchingCollectionGroupQuery(e,t,r,n):this.getDocumentsMatchingCollectionQuery(e,t,r,n)}getNextDocuments(e,t,r,n){return this.remoteDocumentCache.getAllFromCollectionGroup(e,t,r,n).next(i=>{let s=n-i.size>0?this.documentOverlayCache.getOverlaysForCollectionGroup(e,t,r.largestBatchId,n-i.size):PersistencePromise.resolve(__PRIVATE_newDocumentKeyMap()),a=-1,o=i;return s.next(t=>PersistencePromise.forEach(t,(t,r)=>(a<r.largestBatchId&&(a=r.largestBatchId),i.get(t)?PersistencePromise.resolve():this.remoteDocumentCache.getEntry(e,t).next(e=>{o=o.insert(t,e)}))).next(()=>this.populateOverlays(e,t,i)).next(()=>this.computeViews(e,o,t,__PRIVATE_documentKeySet())).next(e=>({batchId:a,changes:__PRIVATE_convertOverlayedDocumentMapToDocumentMap(e)})))})}getDocumentsMatchingDocumentQuery(e,t){return this.getDocument(e,new DocumentKey(t)).next(e=>{let t=documentMap();return e.isFoundDocument()&&(t=t.insert(e.key,e)),t})}getDocumentsMatchingCollectionGroupQuery(e,t,r,n){let i=t.collectionGroup,s=documentMap();return this.indexManager.getCollectionParents(e,i).next(a=>PersistencePromise.forEach(a,a=>{var o;let l=(o=a.child(i),new __PRIVATE_QueryImpl(o,null,t.explicitOrderBy.slice(),t.filters.slice(),t.limit,t.limitType,t.startAt,t.endAt));return this.getDocumentsMatchingCollectionQuery(e,l,r,n).next(e=>{e.forEach((e,t)=>{s=s.insert(e,t)})})}).next(()=>s))}getDocumentsMatchingCollectionQuery(e,t,r,n){let i;return this.documentOverlayCache.getOverlaysForCollection(e,t.path,r.largestBatchId).next(s=>(i=s,this.remoteDocumentCache.getDocumentsMatchingQuery(e,t,r,i,n))).next(e=>{i.forEach((t,r)=>{let n=r.getKey();null===e.get(n)&&(e=e.insert(n,MutableDocument.newInvalidDocument(n)))});let r=documentMap();return e.forEach((e,n)=>{let s=i.get(e);void 0!==s&&__PRIVATE_mutationApplyToLocalView(s.mutation,n,FieldMask.empty(),Timestamp.now()),__PRIVATE_queryMatches(t,n)&&(r=r.insert(e,n))}),r})}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryBundleCache=class __PRIVATE_MemoryBundleCache{constructor(e){this.serializer=e,this.hr=new Map,this.Pr=new Map}getBundleMetadata(e,t){return PersistencePromise.resolve(this.hr.get(t))}saveBundleMetadata(e,t){return this.hr.set(t.id,{id:t.id,version:t.version,createTime:__PRIVATE_fromVersion(t.createTime)}),PersistencePromise.resolve()}getNamedQuery(e,t){return PersistencePromise.resolve(this.Pr.get(t))}saveNamedQuery(e,t){return this.Pr.set(t.name,{name:t.name,query:function(e){let t=function(e){var t,r,n,i,s,a,o,l;let u,c=function(e){let t=__PRIVATE_fromResourceName(e);return 4===t.length?ResourcePath.emptyPath():__PRIVATE_extractLocalPathFromResourceName(t)}(e.parent),_=e.structuredQuery,h=_.from?_.from.length:0,d=null;if(h>0){1===h||fail();let e=_.from[0];e.allDescendants?d=e.collectionId:c=c.child(e.collectionId)}let m=[];_.where&&(m=function(e){var t;let r=function __PRIVATE_fromFilter(e){return void 0!==e.unaryFilter?function(e){switch(e.unaryFilter.op){case"IS_NAN":let t=__PRIVATE_fromFieldPathReference(e.unaryFilter.field);return FieldFilter.create(t,"==",{doubleValue:NaN});case"IS_NULL":let r=__PRIVATE_fromFieldPathReference(e.unaryFilter.field);return FieldFilter.create(r,"==",{nullValue:"NULL_VALUE"});case"IS_NOT_NAN":let n=__PRIVATE_fromFieldPathReference(e.unaryFilter.field);return FieldFilter.create(n,"!=",{doubleValue:NaN});case"IS_NOT_NULL":let i=__PRIVATE_fromFieldPathReference(e.unaryFilter.field);return FieldFilter.create(i,"!=",{nullValue:"NULL_VALUE"});default:return fail()}}(e):void 0!==e.fieldFilter?FieldFilter.create(__PRIVATE_fromFieldPathReference(e.fieldFilter.field),function(e){switch(e){case"EQUAL":return"==";case"NOT_EQUAL":return"!=";case"GREATER_THAN":return">";case"GREATER_THAN_OR_EQUAL":return">=";case"LESS_THAN":return"<";case"LESS_THAN_OR_EQUAL":return"<=";case"ARRAY_CONTAINS":return"array-contains";case"IN":return"in";case"NOT_IN":return"not-in";case"ARRAY_CONTAINS_ANY":return"array-contains-any";default:return fail()}}(e.fieldFilter.op),e.fieldFilter.value):void 0!==e.compositeFilter?CompositeFilter.create(e.compositeFilter.filters.map(e=>__PRIVATE_fromFilter(e)),function(e){switch(e){case"AND":return"and";case"OR":return"or";default:return fail()}}(e.compositeFilter.op)):fail()}(e);return r instanceof CompositeFilter&&__PRIVATE_compositeFilterIsFlat(t=r)&&__PRIVATE_compositeFilterIsConjunction(t)?r.getFilters():[r]}(_.where));let f=[];_.orderBy&&(f=_.orderBy.map(e=>new OrderBy(__PRIVATE_fromFieldPathReference(e.field),function(e){switch(e){case"ASCENDING":return"asc";case"DESCENDING":return"desc";default:return}}(e.direction))));let g=null;_.limit&&(g=null==(u="object"==typeof(t=_.limit)?t.value:t)?null:u);let p=null;_.startAt&&(p=function(e){let t=!!e.before,r=e.values||[];return new Bound(r,t)}(_.startAt));let E=null;return _.endAt&&(E=function(e){let t=!e.before,r=e.values||[];return new Bound(r,t)}(_.endAt)),r=c,n=d,i=f,s=m,a=g,o=p,l=E,new __PRIVATE_QueryImpl(r,n,i,s,a,"F",o,l)}({parent:e.parent,structuredQuery:e.structuredQuery});return"LAST"===e.limitType?__PRIVATE_queryWithLimit(t,t.limit,"L"):t}(t.bundledQuery),readTime:__PRIVATE_fromVersion(t.readTime)}),PersistencePromise.resolve()}};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryDocumentOverlayCache=class __PRIVATE_MemoryDocumentOverlayCache{constructor(){this.overlays=new SortedMap(DocumentKey.comparator),this.Ir=new Map}getOverlay(e,t){return PersistencePromise.resolve(this.overlays.get(t))}getOverlays(e,t){let r=__PRIVATE_newDocumentKeyMap();return PersistencePromise.forEach(t,t=>this.getOverlay(e,t).next(e=>{null!==e&&r.set(t,e)})).next(()=>r)}saveOverlays(e,t,r){return r.forEach((r,n)=>{this.ht(e,t,n)}),PersistencePromise.resolve()}removeOverlaysForBatchId(e,t,r){let n=this.Ir.get(r);return void 0!==n&&(n.forEach(e=>this.overlays=this.overlays.remove(e)),this.Ir.delete(r)),PersistencePromise.resolve()}getOverlaysForCollection(e,t,r){let n=__PRIVATE_newDocumentKeyMap(),i=t.length+1,s=new DocumentKey(t.child("")),a=this.overlays.getIteratorFrom(s);for(;a.hasNext();){let e=a.getNext().value,s=e.getKey();if(!t.isPrefixOf(s.path))break;s.path.length===i&&e.largestBatchId>r&&n.set(e.getKey(),e)}return PersistencePromise.resolve(n)}getOverlaysForCollectionGroup(e,t,r,n){let i=new SortedMap((e,t)=>e-t),s=this.overlays.getIterator();for(;s.hasNext();){let e=s.getNext().value;if(e.getKey().getCollectionGroup()===t&&e.largestBatchId>r){let t=i.get(e.largestBatchId);null===t&&(t=__PRIVATE_newDocumentKeyMap(),i=i.insert(e.largestBatchId,t)),t.set(e.getKey(),e)}}let a=__PRIVATE_newDocumentKeyMap(),o=i.getIterator();for(;o.hasNext()&&(o.getNext().value.forEach((e,t)=>a.set(e,t)),!(a.size()>=n)););return PersistencePromise.resolve(a)}ht(e,t,r){let n=this.overlays.get(r.key);if(null!==n){let e=this.Ir.get(n.largestBatchId).delete(r.key);this.Ir.set(n.largestBatchId,e)}this.overlays=this.overlays.insert(r.key,new Overlay(t,r));let i=this.Ir.get(t);void 0===i&&(i=__PRIVATE_documentKeySet(),this.Ir.set(t,i)),this.Ir.set(t,i.add(r.key))}};/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryGlobalsCache=class __PRIVATE_MemoryGlobalsCache{constructor(){this.sessionToken=ByteString.EMPTY_BYTE_STRING}getSessionToken(e){return PersistencePromise.resolve(this.sessionToken)}setSessionToken(e,t){return this.sessionToken=t,PersistencePromise.resolve()}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_ReferenceSet=class __PRIVATE_ReferenceSet{constructor(){this.Tr=new SortedSet(__PRIVATE_DocReference.Er),this.dr=new SortedSet(__PRIVATE_DocReference.Ar)}isEmpty(){return this.Tr.isEmpty()}addReference(e,t){let r=new __PRIVATE_DocReference(e,t);this.Tr=this.Tr.add(r),this.dr=this.dr.add(r)}Rr(e,t){e.forEach(e=>this.addReference(e,t))}removeReference(e,t){this.Vr(new __PRIVATE_DocReference(e,t))}mr(e,t){e.forEach(e=>this.removeReference(e,t))}gr(e){let t=new DocumentKey(new ResourcePath([])),r=new __PRIVATE_DocReference(t,e),n=new __PRIVATE_DocReference(t,e+1),i=[];return this.dr.forEachInRange([r,n],e=>{this.Vr(e),i.push(e.key)}),i}pr(){this.Tr.forEach(e=>this.Vr(e))}Vr(e){this.Tr=this.Tr.delete(e),this.dr=this.dr.delete(e)}yr(e){let t=new DocumentKey(new ResourcePath([])),r=new __PRIVATE_DocReference(t,e),n=new __PRIVATE_DocReference(t,e+1),i=__PRIVATE_documentKeySet();return this.dr.forEachInRange([r,n],e=>{i=i.add(e.key)}),i}containsKey(e){let t=new __PRIVATE_DocReference(e,0),r=this.Tr.firstAfterOrEqual(t);return null!==r&&e.isEqual(r.key)}};let __PRIVATE_DocReference=class __PRIVATE_DocReference{constructor(e,t){this.key=e,this.wr=t}static Er(e,t){return DocumentKey.comparator(e.key,t.key)||__PRIVATE_primitiveComparator(e.wr,t.wr)}static Ar(e,t){return __PRIVATE_primitiveComparator(e.wr,t.wr)||DocumentKey.comparator(e.key,t.key)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryMutationQueue=class __PRIVATE_MemoryMutationQueue{constructor(e,t){this.indexManager=e,this.referenceDelegate=t,this.mutationQueue=[],this.Sr=1,this.br=new SortedSet(__PRIVATE_DocReference.Er)}checkEmpty(e){return PersistencePromise.resolve(0===this.mutationQueue.length)}addMutationBatch(e,t,r,n){let i=this.Sr;this.Sr++,this.mutationQueue.length>0&&this.mutationQueue[this.mutationQueue.length-1];let s=new MutationBatch(i,t,r,n);for(let t of(this.mutationQueue.push(s),n))this.br=this.br.add(new __PRIVATE_DocReference(t.key,i)),this.indexManager.addToCollectionParentIndex(e,t.key.path.popLast());return PersistencePromise.resolve(s)}lookupMutationBatch(e,t){return PersistencePromise.resolve(this.Dr(t))}getNextMutationBatchAfterBatchId(e,t){let r=this.vr(t+1),n=r<0?0:r;return PersistencePromise.resolve(this.mutationQueue.length>n?this.mutationQueue[n]:null)}getHighestUnacknowledgedBatchId(){return PersistencePromise.resolve(0===this.mutationQueue.length?-1:this.Sr-1)}getAllMutationBatches(e){return PersistencePromise.resolve(this.mutationQueue.slice())}getAllMutationBatchesAffectingDocumentKey(e,t){let r=new __PRIVATE_DocReference(t,0),n=new __PRIVATE_DocReference(t,Number.POSITIVE_INFINITY),i=[];return this.br.forEachInRange([r,n],e=>{let t=this.Dr(e.wr);i.push(t)}),PersistencePromise.resolve(i)}getAllMutationBatchesAffectingDocumentKeys(e,t){let r=new SortedSet(__PRIVATE_primitiveComparator);return t.forEach(e=>{let t=new __PRIVATE_DocReference(e,0),n=new __PRIVATE_DocReference(e,Number.POSITIVE_INFINITY);this.br.forEachInRange([t,n],e=>{r=r.add(e.wr)})}),PersistencePromise.resolve(this.Cr(r))}getAllMutationBatchesAffectingQuery(e,t){let r=t.path,n=r.length+1,i=r;DocumentKey.isDocumentKey(i)||(i=i.child(""));let s=new __PRIVATE_DocReference(new DocumentKey(i),0),a=new SortedSet(__PRIVATE_primitiveComparator);return this.br.forEachWhile(e=>{let t=e.key.path;return!!r.isPrefixOf(t)&&(t.length===n&&(a=a.add(e.wr)),!0)},s),PersistencePromise.resolve(this.Cr(a))}Cr(e){let t=[];return e.forEach(e=>{let r=this.Dr(e);null!==r&&t.push(r)}),t}removeMutationBatch(e,t){0===this.Fr(t.batchId,"removed")||fail(),this.mutationQueue.shift();let r=this.br;return PersistencePromise.forEach(t.mutations,n=>{let i=new __PRIVATE_DocReference(n.key,t.batchId);return r=r.delete(i),this.referenceDelegate.markPotentiallyOrphaned(e,n.key)}).next(()=>{this.br=r})}On(e){}containsKey(e,t){let r=new __PRIVATE_DocReference(t,0),n=this.br.firstAfterOrEqual(r);return PersistencePromise.resolve(t.isEqual(n&&n.key))}performConsistencyCheck(e){return this.mutationQueue.length,PersistencePromise.resolve()}Fr(e,t){return this.vr(e)}vr(e){return 0===this.mutationQueue.length?0:e-this.mutationQueue[0].batchId}Dr(e){let t=this.vr(e);return t<0||t>=this.mutationQueue.length?null:this.mutationQueue[t]}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryRemoteDocumentCacheImpl=class __PRIVATE_MemoryRemoteDocumentCacheImpl{constructor(e){this.Mr=e,this.docs=new SortedMap(DocumentKey.comparator),this.size=0}setIndexManager(e){this.indexManager=e}addEntry(e,t){let r=t.key,n=this.docs.get(r),i=n?n.size:0,s=this.Mr(t);return this.docs=this.docs.insert(r,{document:t.mutableCopy(),size:s}),this.size+=s-i,this.indexManager.addToCollectionParentIndex(e,r.path.popLast())}removeEntry(e){let t=this.docs.get(e);t&&(this.docs=this.docs.remove(e),this.size-=t.size)}getEntry(e,t){let r=this.docs.get(t);return PersistencePromise.resolve(r?r.document.mutableCopy():MutableDocument.newInvalidDocument(t))}getEntries(e,t){let r=P;return t.forEach(e=>{let t=this.docs.get(e);r=r.insert(e,t?t.document.mutableCopy():MutableDocument.newInvalidDocument(e))}),PersistencePromise.resolve(r)}getDocumentsMatchingQuery(e,t,r,n){let i=P,s=t.path,a=new DocumentKey(s.child("")),o=this.docs.getIteratorFrom(a);for(;o.hasNext();){let{key:e,value:{document:a}}=o.getNext();if(!s.isPrefixOf(e.path))break;e.path.length>s.length+1||0>=function(e,t){let r=e.readTime.compareTo(t.readTime);return 0!==r?r:0!==(r=DocumentKey.comparator(e.documentKey,t.documentKey))?r:__PRIVATE_primitiveComparator(e.largestBatchId,t.largestBatchId)}(new IndexOffset(a.readTime,a.key,-1),r)||(n.has(a.key)||__PRIVATE_queryMatches(t,a))&&(i=i.insert(a.key,a.mutableCopy()))}return PersistencePromise.resolve(i)}getAllFromCollectionGroup(e,t,r,n){fail()}Or(e,t){return PersistencePromise.forEach(this.docs,e=>t(e))}newChangeBuffer(e){return new __PRIVATE_MemoryRemoteDocumentChangeBuffer(this)}getSize(e){return PersistencePromise.resolve(this.size)}};let __PRIVATE_MemoryRemoteDocumentChangeBuffer=class __PRIVATE_MemoryRemoteDocumentChangeBuffer extends RemoteDocumentChangeBuffer{constructor(e){super(),this.cr=e}applyChanges(e){let t=[];return this.changes.forEach((r,n)=>{n.isValidDocument()?t.push(this.cr.addEntry(e,n)):this.cr.removeEntry(r)}),PersistencePromise.waitFor(t)}getFromCache(e,t){return this.cr.getEntry(e,t)}getAllFromCache(e,t){return this.cr.getEntries(e,t)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryTargetCache=class __PRIVATE_MemoryTargetCache{constructor(e){this.persistence=e,this.Nr=new ObjectMap(e=>__PRIVATE_canonifyTarget(e),__PRIVATE_targetEquals),this.lastRemoteSnapshotVersion=SnapshotVersion.min(),this.highestTargetId=0,this.Lr=0,this.Br=new __PRIVATE_ReferenceSet,this.targetCount=0,this.kr=__PRIVATE_TargetIdGenerator.Bn()}forEachTarget(e,t){return this.Nr.forEach((e,r)=>t(r)),PersistencePromise.resolve()}getLastRemoteSnapshotVersion(e){return PersistencePromise.resolve(this.lastRemoteSnapshotVersion)}getHighestSequenceNumber(e){return PersistencePromise.resolve(this.Lr)}allocateTargetId(e){return this.highestTargetId=this.kr.next(),PersistencePromise.resolve(this.highestTargetId)}setTargetsMetadata(e,t,r){return r&&(this.lastRemoteSnapshotVersion=r),t>this.Lr&&(this.Lr=t),PersistencePromise.resolve()}Kn(e){this.Nr.set(e.target,e);let t=e.targetId;t>this.highestTargetId&&(this.kr=new __PRIVATE_TargetIdGenerator(t),this.highestTargetId=t),e.sequenceNumber>this.Lr&&(this.Lr=e.sequenceNumber)}addTargetData(e,t){return this.Kn(t),this.targetCount+=1,PersistencePromise.resolve()}updateTargetData(e,t){return this.Kn(t),PersistencePromise.resolve()}removeTargetData(e,t){return this.Nr.delete(t.target),this.Br.gr(t.targetId),this.targetCount-=1,PersistencePromise.resolve()}removeTargets(e,t,r){let n=0,i=[];return this.Nr.forEach((s,a)=>{a.sequenceNumber<=t&&null===r.get(a.targetId)&&(this.Nr.delete(s),i.push(this.removeMatchingKeysForTargetId(e,a.targetId)),n++)}),PersistencePromise.waitFor(i).next(()=>n)}getTargetCount(e){return PersistencePromise.resolve(this.targetCount)}getTargetData(e,t){let r=this.Nr.get(t)||null;return PersistencePromise.resolve(r)}addMatchingKeys(e,t,r){return this.Br.Rr(t,r),PersistencePromise.resolve()}removeMatchingKeys(e,t,r){this.Br.mr(t,r);let n=this.persistence.referenceDelegate,i=[];return n&&t.forEach(t=>{i.push(n.markPotentiallyOrphaned(e,t))}),PersistencePromise.waitFor(i)}removeMatchingKeysForTargetId(e,t){return this.Br.gr(t),PersistencePromise.resolve()}getMatchingKeysForTargetId(e,t){let r=this.Br.yr(t);return PersistencePromise.resolve(r)}containsKey(e,t){return PersistencePromise.resolve(this.Br.containsKey(t))}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_MemoryPersistence=class __PRIVATE_MemoryPersistence{constructor(e,t){this.qr={},this.overlays={},this.Qr=new __PRIVATE_ListenSequence(0),this.Kr=!1,this.Kr=!0,this.$r=new __PRIVATE_MemoryGlobalsCache,this.referenceDelegate=e(this),this.Ur=new __PRIVATE_MemoryTargetCache(this),this.indexManager=new __PRIVATE_MemoryIndexManager,this.remoteDocumentCache=new __PRIVATE_MemoryRemoteDocumentCacheImpl(e=>this.referenceDelegate.Wr(e)),this.serializer=new __PRIVATE_LocalSerializer(t),this.Gr=new __PRIVATE_MemoryBundleCache(this.serializer)}start(){return Promise.resolve()}shutdown(){return this.Kr=!1,Promise.resolve()}get started(){return this.Kr}setDatabaseDeletedListener(){}setNetworkEnabled(){}getIndexManager(e){return this.indexManager}getDocumentOverlayCache(e){let t=this.overlays[e.toKey()];return t||(t=new __PRIVATE_MemoryDocumentOverlayCache,this.overlays[e.toKey()]=t),t}getMutationQueue(e,t){let r=this.qr[e.toKey()];return r||(r=new __PRIVATE_MemoryMutationQueue(t,this.referenceDelegate),this.qr[e.toKey()]=r),r}getGlobalsCache(){return this.$r}getTargetCache(){return this.Ur}getRemoteDocumentCache(){return this.remoteDocumentCache}getBundleCache(){return this.Gr}runTransaction(e,t,r){__PRIVATE_logDebug("MemoryPersistence","Starting transaction:",e);let n=new __PRIVATE_MemoryTransaction(this.Qr.next());return this.referenceDelegate.zr(),r(n).next(e=>this.referenceDelegate.jr(n).next(()=>e)).toPromise().then(e=>(n.raiseOnCommittedEvent(),e))}Hr(e,t){return PersistencePromise.or(Object.values(this.qr).map(r=>()=>r.containsKey(e,t)))}};let __PRIVATE_MemoryTransaction=class __PRIVATE_MemoryTransaction extends PersistenceTransaction{constructor(e){super(),this.currentSequenceNumber=e}};let __PRIVATE_MemoryEagerDelegate=class __PRIVATE_MemoryEagerDelegate{constructor(e){this.persistence=e,this.Jr=new __PRIVATE_ReferenceSet,this.Yr=null}static Zr(e){return new __PRIVATE_MemoryEagerDelegate(e)}get Xr(){if(this.Yr)return this.Yr;throw fail()}addReference(e,t,r){return this.Jr.addReference(r,t),this.Xr.delete(r.toString()),PersistencePromise.resolve()}removeReference(e,t,r){return this.Jr.removeReference(r,t),this.Xr.add(r.toString()),PersistencePromise.resolve()}markPotentiallyOrphaned(e,t){return this.Xr.add(t.toString()),PersistencePromise.resolve()}removeTarget(e,t){this.Jr.gr(t.targetId).forEach(e=>this.Xr.add(e.toString()));let r=this.persistence.getTargetCache();return r.getMatchingKeysForTargetId(e,t.targetId).next(e=>{e.forEach(e=>this.Xr.add(e.toString()))}).next(()=>r.removeTargetData(e,t))}zr(){this.Yr=new Set}jr(e){let t=this.persistence.getRemoteDocumentCache().newChangeBuffer();return PersistencePromise.forEach(this.Xr,r=>{let n=DocumentKey.fromPath(r);return this.ei(e,n).next(e=>{e||t.removeEntry(n,SnapshotVersion.min())})}).next(()=>(this.Yr=null,t.apply(e)))}updateLimboDocument(e,t){return this.ei(e,t).next(e=>{e?this.Xr.delete(t.toString()):this.Xr.add(t.toString())})}Wr(e){return 0}ei(e,t){return PersistencePromise.or([()=>PersistencePromise.resolve(this.Jr.containsKey(t)),()=>this.persistence.getTargetCache().containsKey(e,t),()=>this.persistence.Hr(e,t)])}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_LocalViewChanges=class __PRIVATE_LocalViewChanges{constructor(e,t,r,n){this.targetId=e,this.fromCache=t,this.$i=r,this.Ui=n}static Wi(e,t){let r=__PRIVATE_documentKeySet(),n=__PRIVATE_documentKeySet();for(let e of t.docChanges)switch(e.type){case 0:r=r.add(e.doc.key);break;case 1:n=n.add(e.doc.key)}return new __PRIVATE_LocalViewChanges(e,t.fromCache,r,n)}};/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let QueryContext=class QueryContext{constructor(){this._documentReadCount=0}get documentReadCount(){return this._documentReadCount}incrementDocumentReadCount(e){this._documentReadCount+=e}};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_QueryEngine=class __PRIVATE_QueryEngine{constructor(){this.Gi=!1,this.zi=!1,this.ji=100,this.Hi=(0,c.G6)()?8:function(e){let t=e.match(/Android ([\d.]+)/i),r=t?t[1].split(".").slice(0,2).join("."):"-1";return Number(r)}((0,c.z$)())>0?6:4}initialize(e,t){this.Ji=e,this.indexManager=t,this.Gi=!0}getDocumentsMatchingQuery(e,t,r,n){let i={result:null};return this.Yi(e,t).next(e=>{i.result=e}).next(()=>{if(!i.result)return this.Zi(e,t,n,r).next(e=>{i.result=e})}).next(()=>{if(i.result)return;let r=new QueryContext;return this.Xi(e,t,r).next(n=>{if(i.result=n,this.zi)return this.es(e,t,r,n.size)})}).next(()=>i.result)}es(e,t,r,n){return r.documentReadCount<this.ji?(__PRIVATE_getLogLevel()<=u.in.DEBUG&&__PRIVATE_logDebug("QueryEngine","SDK will not create cache indexes for query:",__PRIVATE_stringifyQuery(t),"since it only creates cache indexes for collection contains","more than or equal to",this.ji,"documents"),PersistencePromise.resolve()):(__PRIVATE_getLogLevel()<=u.in.DEBUG&&__PRIVATE_logDebug("QueryEngine","Query:",__PRIVATE_stringifyQuery(t),"scans",r.documentReadCount,"local documents and returns",n,"documents as results."),r.documentReadCount>this.Hi*n?(__PRIVATE_getLogLevel()<=u.in.DEBUG&&__PRIVATE_logDebug("QueryEngine","The SDK decides to create cache indexes for query:",__PRIVATE_stringifyQuery(t),"as using cache indexes may help improve performance."),this.indexManager.createTargetIndexes(e,__PRIVATE_queryToTarget(t))):PersistencePromise.resolve())}Yi(e,t){if(__PRIVATE_queryMatchesAllDocuments(t))return PersistencePromise.resolve(null);let r=__PRIVATE_queryToTarget(t);return this.indexManager.getIndexType(e,r).next(n=>0===n?null:(null!==t.limit&&1===n&&(r=__PRIVATE_queryToTarget(t=__PRIVATE_queryWithLimit(t,null,"F"))),this.indexManager.getDocumentsMatchingTarget(e,r).next(n=>{let i=__PRIVATE_documentKeySet(...n);return this.Ji.getDocuments(e,i).next(n=>this.indexManager.getMinOffset(e,r).next(r=>{let s=this.ts(t,n);return this.ns(t,s,i,r.readTime)?this.Yi(e,__PRIVATE_queryWithLimit(t,null,"F")):this.rs(e,s,t,r)}))})))}Zi(e,t,r,n){return __PRIVATE_queryMatchesAllDocuments(t)||n.isEqual(SnapshotVersion.min())?PersistencePromise.resolve(null):this.Ji.getDocuments(e,r).next(i=>{let s=this.ts(t,i);return this.ns(t,s,r,n)?PersistencePromise.resolve(null):(__PRIVATE_getLogLevel()<=u.in.DEBUG&&__PRIVATE_logDebug("QueryEngine","Re-using previous result from %s to execute query: %s",n.toString(),__PRIVATE_stringifyQuery(t)),this.rs(e,s,t,function(e,t){let r=e.toTimestamp().seconds,n=e.toTimestamp().nanoseconds+1,i=SnapshotVersion.fromTimestamp(1e9===n?new Timestamp(r+1,0):new Timestamp(r,n));return new IndexOffset(i,DocumentKey.empty(),-1)}(n,0)).next(e=>e))})}ts(e,t){let r=new SortedSet(__PRIVATE_newQueryComparator(e));return t.forEach((t,n)=>{__PRIVATE_queryMatches(e,n)&&(r=r.add(n))}),r}ns(e,t,r,n){if(null===e.limit)return!1;if(r.size!==t.size)return!0;let i="F"===e.limitType?t.last():t.first();return!!i&&(i.hasPendingWrites||i.version.compareTo(n)>0)}Xi(e,t,r){return __PRIVATE_getLogLevel()<=u.in.DEBUG&&__PRIVATE_logDebug("QueryEngine","Using full collection scan to execute query:",__PRIVATE_stringifyQuery(t)),this.Ji.getDocumentsMatchingQuery(e,t,IndexOffset.min(),r)}rs(e,t,r,n){return this.Ji.getDocumentsMatchingQuery(e,r,n).next(e=>(t.forEach(t=>{e=e.insert(t.key,t)}),e))}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_LocalStoreImpl=class __PRIVATE_LocalStoreImpl{constructor(e,t,r,n){this.persistence=e,this.ss=t,this.serializer=n,this.os=new SortedMap(__PRIVATE_primitiveComparator),this._s=new ObjectMap(e=>__PRIVATE_canonifyTarget(e),__PRIVATE_targetEquals),this.us=new Map,this.cs=e.getRemoteDocumentCache(),this.Ur=e.getTargetCache(),this.Gr=e.getBundleCache(),this.ls(r)}ls(e){this.documentOverlayCache=this.persistence.getDocumentOverlayCache(e),this.indexManager=this.persistence.getIndexManager(e),this.mutationQueue=this.persistence.getMutationQueue(e,this.indexManager),this.localDocuments=new LocalDocumentsView(this.cs,this.mutationQueue,this.documentOverlayCache,this.indexManager),this.cs.setIndexManager(this.indexManager),this.ss.initialize(this.localDocuments,this.indexManager)}collectGarbage(e){return this.persistence.runTransaction("Collect garbage","readwrite-primary",t=>e.collect(t,this.os))}};async function __PRIVATE_localStoreHandleUserChange(e,t){return await e.persistence.runTransaction("Handle user change","readonly",r=>{let n;return e.mutationQueue.getAllMutationBatches(r).next(i=>(n=i,e.ls(t),e.mutationQueue.getAllMutationBatches(r))).next(t=>{let i=[],s=[],a=__PRIVATE_documentKeySet();for(let e of n)for(let t of(i.push(e.batchId),e.mutations))a=a.add(t.key);for(let e of t)for(let t of(s.push(e.batchId),e.mutations))a=a.add(t.key);return e.localDocuments.getDocuments(r,a).next(e=>({hs:e,removedBatchIds:i,addedBatchIds:s}))})})}function __PRIVATE_localStoreGetLastRemoteSnapshotVersion(e){return e.persistence.runTransaction("Get last remote snapshot version","readonly",t=>e.Ur.getLastRemoteSnapshotVersion(t))}async function __PRIVATE_localStoreReleaseTarget(e,t,r){let n=e.os.get(t);try{r||await e.persistence.runTransaction("Release target",r?"readwrite":"readwrite-primary",t=>e.persistence.referenceDelegate.removeTarget(t,n))}catch(e){if(!__PRIVATE_isIndexedDbTransactionError(e))throw e;__PRIVATE_logDebug("LocalStore",`Failed to update sequence numbers for target ${t}: ${e}`)}e.os=e.os.remove(t),e._s.delete(n.target)}function __PRIVATE_localStoreExecuteQuery(e,t,r){let n=SnapshotVersion.min(),i=__PRIVATE_documentKeySet();return e.persistence.runTransaction("Execute query","readwrite",s=>(function(e,t,r){let n=e._s.get(r);return void 0!==n?PersistencePromise.resolve(e.os.get(n)):e.Ur.getTargetData(t,r)})(e,s,__PRIVATE_queryToTarget(t)).next(t=>{if(t)return n=t.lastLimboFreeSnapshotVersion,e.Ur.getMatchingKeysForTargetId(s,t.targetId).next(e=>{i=e})}).next(()=>e.ss.getDocumentsMatchingQuery(s,t,r?n:SnapshotVersion.min(),r?i:__PRIVATE_documentKeySet())).next(r=>{var n;let s;return n=t.collectionGroup||(t.path.length%2==1?t.path.lastSegment():t.path.get(t.path.length-2)),s=e.us.get(n)||SnapshotVersion.min(),r.forEach((e,t)=>{t.readTime.compareTo(s)>0&&(s=t.readTime)}),e.us.set(n,s),{documents:r,Ts:i}}))}let __PRIVATE_LocalClientState=class __PRIVATE_LocalClientState{constructor(){this.activeTargetIds=V}fs(e){this.activeTargetIds=this.activeTargetIds.add(e)}gs(e){this.activeTargetIds=this.activeTargetIds.delete(e)}Vs(){let e={activeTargetIds:this.activeTargetIds.toArray(),updateTimeMs:Date.now()};return JSON.stringify(e)}};let __PRIVATE_MemorySharedClientState=class __PRIVATE_MemorySharedClientState{constructor(){this.so=new __PRIVATE_LocalClientState,this.oo={},this.onlineStateHandler=null,this.sequenceNumberHandler=null}addPendingMutation(e){}updateMutationState(e,t,r){}addLocalQueryTarget(e,t=!0){return t&&this.so.fs(e),this.oo[e]||"not-current"}updateQueryState(e,t,r){this.oo[e]=t}removeLocalQueryTarget(e){this.so.gs(e)}isLocalQueryTarget(e){return this.so.activeTargetIds.has(e)}clearQueryState(e){delete this.oo[e]}getAllActiveQueryTargets(){return this.so.activeTargetIds}isActiveQueryTarget(e){return this.so.activeTargetIds.has(e)}start(){return this.so=new __PRIVATE_LocalClientState,Promise.resolve()}handleUserChange(e,t,r){}setOnlineState(e){}shutdown(){}writeSequenceNumber(e){}notifyBundleLoaded(e){}};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_NoopConnectivityMonitor=class __PRIVATE_NoopConnectivityMonitor{_o(e){}shutdown(){}};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_BrowserConnectivityMonitor=class __PRIVATE_BrowserConnectivityMonitor{constructor(){this.ao=()=>this.uo(),this.co=()=>this.lo(),this.ho=[],this.Po()}_o(e){this.ho.push(e)}shutdown(){window.removeEventListener("online",this.ao),window.removeEventListener("offline",this.co)}Po(){window.addEventListener("online",this.ao),window.addEventListener("offline",this.co)}uo(){for(let e of(__PRIVATE_logDebug("ConnectivityMonitor","Network connectivity changed: AVAILABLE"),this.ho))e(0)}lo(){for(let e of(__PRIVATE_logDebug("ConnectivityMonitor","Network connectivity changed: UNAVAILABLE"),this.ho))e(1)}static D(){return"undefined"!=typeof window&&void 0!==window.addEventListener&&void 0!==window.removeEventListener}};/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let D=null;function __PRIVATE_generateUniqueDebugId(){return null===D?D=268435456+Math.round(2147483648*Math.random()):D++,"0x"+D.toString(16)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let b={BatchGetDocuments:"batchGet",Commit:"commit",RunQuery:"runQuery",RunAggregationQuery:"runAggregationQuery"};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_StreamBridge=class __PRIVATE_StreamBridge{constructor(e){this.Io=e.Io,this.To=e.To}Eo(e){this.Ao=e}Ro(e){this.Vo=e}mo(e){this.fo=e}onMessage(e){this.po=e}close(){this.To()}send(e){this.Io(e)}yo(){this.Ao()}wo(){this.Vo()}So(e){this.fo(e)}bo(e){this.po(e)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let N="WebChannelConnection";let __PRIVATE_WebChannelConnection=class __PRIVATE_WebChannelConnection extends class{constructor(e){this.databaseInfo=e,this.databaseId=e.databaseId;let t=e.ssl?"https":"http",r=encodeURIComponent(this.databaseId.projectId),n=encodeURIComponent(this.databaseId.database);this.Do=t+"://"+e.host,this.vo=`projects/${r}/databases/${n}`,this.Co="(default)"===this.databaseId.database?`project_id=${r}`:`project_id=${r}&database_id=${n}`}get Fo(){return!1}Mo(e,t,r,n,i){let s=__PRIVATE_generateUniqueDebugId(),a=this.xo(e,t.toUriEncodedString());__PRIVATE_logDebug("RestConnection",`Sending RPC '${e}' ${s}:`,a,r);let o={"google-cloud-resource-prefix":this.vo,"x-goog-request-params":this.Co};return this.Oo(o,n,i),this.No(e,a,o,r).then(t=>(__PRIVATE_logDebug("RestConnection",`Received RPC '${e}' ${s}: `,t),t),t=>{throw __PRIVATE_logWarn("RestConnection",`RPC '${e}' ${s} failed with error: `,t,"url: ",a,"request:",r),t})}Lo(e,t,r,n,i,s){return this.Mo(e,t,r,n,i)}Oo(e,t,r){e["X-Goog-Api-Client"]=function(){return"gl-js/ fire/"+f}(),e["Content-Type"]="text/plain",this.databaseInfo.appId&&(e["X-Firebase-GMPID"]=this.databaseInfo.appId),t&&t.headers.forEach((t,r)=>e[r]=t),r&&r.headers.forEach((t,r)=>e[r]=t)}xo(e,t){let r=b[e];return`${this.Do}/v1/${t}:${r}`}terminate(){}}{constructor(e){super(e),this.forceLongPolling=e.forceLongPolling,this.autoDetectLongPolling=e.autoDetectLongPolling,this.useFetchStreams=e.useFetchStreams,this.longPollingOptions=e.longPollingOptions}No(e,t,r,n){let i=__PRIVATE_generateUniqueDebugId();return new Promise((s,a)=>{let o=new h.JJ;o.setWithCredentials(!0),o.listenOnce(h.tw.COMPLETE,()=>{try{switch(o.getLastErrorCode()){case h.jK.NO_ERROR:let t=o.getResponseJson();__PRIVATE_logDebug(N,`XHR for RPC '${e}' ${i} received:`,JSON.stringify(t)),s(t);break;case h.jK.TIMEOUT:__PRIVATE_logDebug(N,`RPC '${e}' ${i} timed out`),a(new FirestoreError(p.DEADLINE_EXCEEDED,"Request time out"));break;case h.jK.HTTP_ERROR:let r=o.getStatus();if(__PRIVATE_logDebug(N,`RPC '${e}' ${i} failed with status:`,r,"response text:",o.getResponseText()),r>0){let e=o.getResponseJson();Array.isArray(e)&&(e=e[0]);let t=null==e?void 0:e.error;if(t&&t.status&&t.message){let e=function(e){let t=e.toLowerCase().replace(/_/g,"-");return Object.values(p).indexOf(t)>=0?t:p.UNKNOWN}(t.status);a(new FirestoreError(e,t.message))}else a(new FirestoreError(p.UNKNOWN,"Server responded with status "+o.getStatus()))}else a(new FirestoreError(p.UNAVAILABLE,"Connection failed."));break;default:fail()}}finally{__PRIVATE_logDebug(N,`RPC '${e}' ${i} completed.`)}});let l=JSON.stringify(n);__PRIVATE_logDebug(N,`RPC '${e}' ${i} sending request:`,n),o.send(t,"POST",l,r,15)})}Bo(e,t,r){let i=__PRIVATE_generateUniqueDebugId(),s=[this.Do,"/","google.firestore.v1.Firestore","/",e,"/channel"],a=(0,h.UE)(),o=(0,h.FJ)(),l={httpSessionIdParam:"gsessionid",initMessageHeaders:{},messageUrlParams:{database:`projects/${this.databaseId.projectId}/databases/${this.databaseId.database}`},sendRawJson:!0,supportsCrossDomainXhr:!0,internalChannelParams:{forwardChannelRequestTimeoutMs:6e5},forceLongPolling:this.forceLongPolling,detectBufferingProxy:this.autoDetectLongPolling},u=this.longPollingOptions.timeoutSeconds;void 0!==u&&(l.longPollingTimeout=Math.round(1e3*u)),this.useFetchStreams&&(l.useFetchStreams=!0),this.Oo(l.initMessageHeaders,t,r),l.encodeInitMessageHeaders=!0;let c=s.join("");__PRIVATE_logDebug(N,`Creating RPC '${e}' stream ${i}: ${c}`,l);let _=a.createWebChannel(c,l),d=!1,m=!1,f=new __PRIVATE_StreamBridge({Io:t=>{m?__PRIVATE_logDebug(N,`Not sending because RPC '${e}' stream ${i} is closed:`,t):(d||(__PRIVATE_logDebug(N,`Opening RPC '${e}' stream ${i} transport.`),_.open(),d=!0),__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} sending:`,t),_.send(t))},To:()=>_.close()}),__PRIVATE_unguardedEventListen=(e,t,r)=>{e.listen(t,e=>{try{r(e)}catch(e){setTimeout(()=>{throw e},0)}})};return __PRIVATE_unguardedEventListen(_,h.ii.EventType.OPEN,()=>{m||(__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} transport opened.`),f.yo())}),__PRIVATE_unguardedEventListen(_,h.ii.EventType.CLOSE,()=>{m||(m=!0,__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} transport closed`),f.So())}),__PRIVATE_unguardedEventListen(_,h.ii.EventType.ERROR,t=>{m||(m=!0,__PRIVATE_logWarn(N,`RPC '${e}' stream ${i} transport errored:`,t),f.So(new FirestoreError(p.UNAVAILABLE,"The operation could not be completed")))}),__PRIVATE_unguardedEventListen(_,h.ii.EventType.MESSAGE,t=>{var r;if(!m){let s=t.data[0];s||fail();let a=s.error||(null===(r=s[0])||void 0===r?void 0:r.error);if(a){__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} received error:`,a);let t=a.status,r=function(e){let t=n[e];if(void 0!==t)return __PRIVATE_mapCodeFromRpcCode(t)}(t),s=a.message;void 0===r&&(r=p.INTERNAL,s="Unknown error status: "+t+" with message "+a.message),m=!0,f.So(new FirestoreError(r,s)),_.close()}else __PRIVATE_logDebug(N,`RPC '${e}' stream ${i} received:`,s),f.bo(s)}}),__PRIVATE_unguardedEventListen(o,h.ju.STAT_EVENT,t=>{t.stat===h.kN.PROXY?__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} detected buffering proxy`):t.stat===h.kN.NOPROXY&&__PRIVATE_logDebug(N,`RPC '${e}' stream ${i} detected no buffering proxy`)}),setTimeout(()=>{f.wo()},0),f}};function getDocument(){return"undefined"!=typeof document?document:null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function __PRIVATE_newSerializer(e){return new JsonProtoSerializer(e,!0)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_ExponentialBackoff=class __PRIVATE_ExponentialBackoff{constructor(e,t,r=1e3,n=1.5,i=6e4){this.ui=e,this.timerId=t,this.ko=r,this.qo=n,this.Qo=i,this.Ko=0,this.$o=null,this.Uo=Date.now(),this.reset()}reset(){this.Ko=0}Wo(){this.Ko=this.Qo}Go(e){this.cancel();let t=Math.floor(this.Ko+this.zo()),r=Math.max(0,Date.now()-this.Uo),n=Math.max(0,t-r);n>0&&__PRIVATE_logDebug("ExponentialBackoff",`Backing off for ${n} ms (base delay: ${this.Ko} ms, delay with jitter: ${t} ms, last attempt: ${r} ms ago)`),this.$o=this.ui.enqueueAfterDelay(this.timerId,n,()=>(this.Uo=Date.now(),e())),this.Ko*=this.qo,this.Ko<this.ko&&(this.Ko=this.ko),this.Ko>this.Qo&&(this.Ko=this.Qo)}jo(){null!==this.$o&&(this.$o.skipDelay(),this.$o=null)}cancel(){null!==this.$o&&(this.$o.cancel(),this.$o=null)}zo(){return(Math.random()-.5)*this.Ko}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_PersistentStream=class __PRIVATE_PersistentStream{constructor(e,t,r,n,i,s,a,o){this.ui=e,this.Ho=r,this.Jo=n,this.connection=i,this.authCredentialsProvider=s,this.appCheckCredentialsProvider=a,this.listener=o,this.state=0,this.Yo=0,this.Zo=null,this.Xo=null,this.stream=null,this.e_=0,this.t_=new __PRIVATE_ExponentialBackoff(e,t)}n_(){return 1===this.state||5===this.state||this.r_()}r_(){return 2===this.state||3===this.state}start(){this.e_=0,4!==this.state?this.auth():this.i_()}async stop(){this.n_()&&await this.close(0)}s_(){this.state=0,this.t_.reset()}o_(){this.r_()&&null===this.Zo&&(this.Zo=this.ui.enqueueAfterDelay(this.Ho,6e4,()=>this.__()))}a_(e){this.u_(),this.stream.send(e)}async __(){if(this.r_())return this.close(0)}u_(){this.Zo&&(this.Zo.cancel(),this.Zo=null)}c_(){this.Xo&&(this.Xo.cancel(),this.Xo=null)}async close(e,t){this.u_(),this.c_(),this.t_.cancel(),this.Yo++,4!==e?this.t_.reset():t&&t.code===p.RESOURCE_EXHAUSTED?(__PRIVATE_logError(t.toString()),__PRIVATE_logError("Using maximum backoff delay to prevent overloading the backend."),this.t_.Wo()):t&&t.code===p.UNAUTHENTICATED&&3!==this.state&&(this.authCredentialsProvider.invalidateToken(),this.appCheckCredentialsProvider.invalidateToken()),null!==this.stream&&(this.l_(),this.stream.close(),this.stream=null),this.state=e,await this.listener.mo(t)}l_(){}auth(){this.state=1;let e=this.h_(this.Yo),t=this.Yo;Promise.all([this.authCredentialsProvider.getToken(),this.appCheckCredentialsProvider.getToken()]).then(([e,r])=>{this.Yo===t&&this.P_(e,r)},t=>{e(()=>{let e=new FirestoreError(p.UNKNOWN,"Fetching auth token failed: "+t.message);return this.I_(e)})})}P_(e,t){let r=this.h_(this.Yo);this.stream=this.T_(e,t),this.stream.Eo(()=>{r(()=>this.listener.Eo())}),this.stream.Ro(()=>{r(()=>(this.state=2,this.Xo=this.ui.enqueueAfterDelay(this.Jo,1e4,()=>(this.r_()&&(this.state=3),Promise.resolve())),this.listener.Ro()))}),this.stream.mo(e=>{r(()=>this.I_(e))}),this.stream.onMessage(e=>{r(()=>1==++this.e_?this.E_(e):this.onNext(e))})}i_(){this.state=5,this.t_.Go(async()=>{this.state=0,this.start()})}I_(e){return __PRIVATE_logDebug("PersistentStream",`close with error: ${e}`),this.stream=null,this.close(4,e)}h_(e){return t=>{this.ui.enqueueAndForget(()=>this.Yo===e?t():(__PRIVATE_logDebug("PersistentStream","stream callback skipped by getCloseGuardedDispatcher."),Promise.resolve()))}}};let __PRIVATE_PersistentListenStream=class __PRIVATE_PersistentListenStream extends __PRIVATE_PersistentStream{constructor(e,t,r,n,i,s){super(e,"listen_stream_connection_backoff","listen_stream_idle","health_check_timeout",t,r,n,s),this.serializer=i}T_(e,t){return this.connection.Bo("Listen",e,t)}E_(e){return this.onNext(e)}onNext(e){this.t_.reset();let t=function(e,t){let r;if("targetChange"in t){var n,i;t.targetChange;let s="NO_CHANGE"===(n=t.targetChange.targetChangeType||"NO_CHANGE")?0:"ADD"===n?1:"REMOVE"===n?2:"CURRENT"===n?3:"RESET"===n?4:fail(),a=t.targetChange.targetIds||[],o=(i=t.targetChange.resumeToken,e.useProto3Json?(void 0===i||"string"==typeof i||fail(),ByteString.fromBase64String(i||"")):(void 0===i||i instanceof d||i instanceof Uint8Array||fail(),ByteString.fromUint8Array(i||new Uint8Array))),l=t.targetChange.cause,u=l&&function(e){let t=void 0===e.code?p.UNKNOWN:__PRIVATE_mapCodeFromRpcCode(e.code);return new FirestoreError(t,e.message||"")}(l);r=new __PRIVATE_WatchTargetChange(s,a,o,u||null)}else if("documentChange"in t){t.documentChange;let n=t.documentChange;n.document,n.document.name,n.document.updateTime;let i=fromName(e,n.document.name),s=__PRIVATE_fromVersion(n.document.updateTime),a=n.document.createTime?__PRIVATE_fromVersion(n.document.createTime):SnapshotVersion.min(),o=new ObjectValue({mapValue:{fields:n.document.fields}}),l=MutableDocument.newFoundDocument(i,s,a,o),u=n.targetIds||[],c=n.removedTargetIds||[];r=new __PRIVATE_DocumentWatchChange(u,c,l.key,l)}else if("documentDelete"in t){t.documentDelete;let n=t.documentDelete;n.document;let i=fromName(e,n.document),s=n.readTime?__PRIVATE_fromVersion(n.readTime):SnapshotVersion.min(),a=MutableDocument.newNoDocument(i,s),o=n.removedTargetIds||[];r=new __PRIVATE_DocumentWatchChange([],o,a.key,a)}else if("documentRemove"in t){t.documentRemove;let n=t.documentRemove;n.document;let i=fromName(e,n.document),s=n.removedTargetIds||[];r=new __PRIVATE_DocumentWatchChange([],s,i,null)}else{if(!("filter"in t))return fail();{t.filter;let e=t.filter;e.targetId;let{count:n=0,unchangedNames:i}=e,s=new ExistenceFilter(n,i),a=e.targetId;r=new __PRIVATE_ExistenceFilterChange(a,s)}}return r}(this.serializer,e),r=function(e){if(!("targetChange"in e))return SnapshotVersion.min();let t=e.targetChange;return t.targetIds&&t.targetIds.length?SnapshotVersion.min():t.readTime?__PRIVATE_fromVersion(t.readTime):SnapshotVersion.min()}(e);return this.listener.d_(t,r)}A_(e){let t={};t.database=__PRIVATE_getEncodedDatabaseId(this.serializer),t.addTarget=function(e,t){let r;let n=t.target;if((r=__PRIVATE_targetIsDocumentTarget(n)?{documents:{documents:[__PRIVATE_toQueryPath(e,n.path)]}}:{query:function(e,t){var r,n;let i;let s={structuredQuery:{}},a=t.path;null!==t.collectionGroup?(i=a,s.structuredQuery.from=[{collectionId:t.collectionGroup,allDescendants:!0}]):(i=a.popLast(),s.structuredQuery.from=[{collectionId:a.lastSegment()}]),s.parent=__PRIVATE_toQueryPath(e,i);let o=function(e){if(0!==e.length)return function __PRIVATE_toFilter(e){return e instanceof FieldFilter?function(e){if("=="===e.op){if(__PRIVATE_isNanValue(e.value))return{unaryFilter:{field:__PRIVATE_toFieldPathReference(e.field),op:"IS_NAN"}};if(__PRIVATE_isNullValue(e.value))return{unaryFilter:{field:__PRIVATE_toFieldPathReference(e.field),op:"IS_NULL"}}}else if("!="===e.op){if(__PRIVATE_isNanValue(e.value))return{unaryFilter:{field:__PRIVATE_toFieldPathReference(e.field),op:"IS_NOT_NAN"}};if(__PRIVATE_isNullValue(e.value))return{unaryFilter:{field:__PRIVATE_toFieldPathReference(e.field),op:"IS_NOT_NULL"}}}return{fieldFilter:{field:__PRIVATE_toFieldPathReference(e.field),op:w[e.op],value:e.value}}}(e):e instanceof CompositeFilter?function(e){let t=e.getFilters().map(e=>__PRIVATE_toFilter(e));return 1===t.length?t[0]:{compositeFilter:{op:C[e.op],filters:t}}}(e):fail()}(CompositeFilter.create(e,"and"))}(t.filters);o&&(s.structuredQuery.where=o);let l=function(e){if(0!==e.length)return e.map(e=>({field:__PRIVATE_toFieldPathReference(e.field),direction:S[e.dir]}))}(t.orderBy);l&&(s.structuredQuery.orderBy=l);let u=__PRIVATE_toInt32Proto(e,t.limit);return null!==u&&(s.structuredQuery.limit=u),t.startAt&&(s.structuredQuery.startAt={before:(r=t.startAt).inclusive,values:r.position}),t.endAt&&(s.structuredQuery.endAt={before:!(n=t.endAt).inclusive,values:n.position}),{_t:s,parent:i}}(e,n)._t}).targetId=t.targetId,t.resumeToken.approximateByteSize()>0){r.resumeToken=__PRIVATE_toBytes(e,t.resumeToken);let n=__PRIVATE_toInt32Proto(e,t.expectedCount);null!==n&&(r.expectedCount=n)}else if(t.snapshotVersion.compareTo(SnapshotVersion.min())>0){r.readTime=toTimestamp(e,t.snapshotVersion.toTimestamp());let n=__PRIVATE_toInt32Proto(e,t.expectedCount);null!==n&&(r.expectedCount=n)}return r}(this.serializer,e);let r=function(e,t){let r=function(e){switch(e){case"TargetPurposeListen":return null;case"TargetPurposeExistenceFilterMismatch":return"existence-filter-mismatch";case"TargetPurposeExistenceFilterMismatchBloom":return"existence-filter-mismatch-bloom";case"TargetPurposeLimboResolution":return"limbo-document";default:return fail()}}(t.purpose);return null==r?null:{"goog-listen-tags":r}}(this.serializer,e);r&&(t.labels=r),this.a_(t)}R_(e){let t={};t.database=__PRIVATE_getEncodedDatabaseId(this.serializer),t.removeTarget=e,this.a_(t)}};let __PRIVATE_PersistentWriteStream=class __PRIVATE_PersistentWriteStream extends __PRIVATE_PersistentStream{constructor(e,t,r,n,i,s){super(e,"write_stream_connection_backoff","write_stream_idle","health_check_timeout",t,r,n,s),this.serializer=i}get V_(){return this.e_>0}start(){this.lastStreamToken=void 0,super.start()}l_(){this.V_&&this.m_([])}T_(e,t){return this.connection.Bo("Write",e,t)}E_(e){return e.streamToken||fail(),this.lastStreamToken=e.streamToken,e.writeResults&&0!==e.writeResults.length&&fail(),this.listener.f_()}onNext(e){var t,r;e.streamToken||fail(),this.lastStreamToken=e.streamToken,this.t_.reset();let n=(t=e.writeResults,r=e.commitTime,t&&t.length>0?(void 0!==r||fail(),t.map(e=>{let t;return(t=e.updateTime?__PRIVATE_fromVersion(e.updateTime):__PRIVATE_fromVersion(r)).isEqual(SnapshotVersion.min())&&(t=__PRIVATE_fromVersion(r)),new MutationResult(t,e.transformResults||[])})):[]),i=__PRIVATE_fromVersion(e.commitTime);return this.listener.g_(i,n)}p_(){let e={};e.database=__PRIVATE_getEncodedDatabaseId(this.serializer),this.a_(e)}m_(e){let t={streamToken:this.lastStreamToken,writes:e.map(e=>(function(e,t){var r;let n;if(t instanceof __PRIVATE_SetMutation)n={update:__PRIVATE_toMutationDocument(e,t.key,t.value)};else if(t instanceof __PRIVATE_DeleteMutation)n={delete:__PRIVATE_toName(e,t.key)};else if(t instanceof __PRIVATE_PatchMutation)n={update:__PRIVATE_toMutationDocument(e,t.key,t.data),updateMask:function(e){let t=[];return e.fields.forEach(e=>t.push(e.canonicalString())),{fieldPaths:t}}(t.fieldMask)};else{if(!(t instanceof __PRIVATE_VerifyMutation))return fail();n={verify:__PRIVATE_toName(e,t.key)}}return t.fieldTransforms.length>0&&(n.updateTransforms=t.fieldTransforms.map(e=>(function(e,t){let r=t.transform;if(r instanceof __PRIVATE_ServerTimestampTransform)return{fieldPath:t.field.canonicalString(),setToServerValue:"REQUEST_TIME"};if(r instanceof __PRIVATE_ArrayUnionTransformOperation)return{fieldPath:t.field.canonicalString(),appendMissingElements:{values:r.elements}};if(r instanceof __PRIVATE_ArrayRemoveTransformOperation)return{fieldPath:t.field.canonicalString(),removeAllFromArray:{values:r.elements}};if(r instanceof __PRIVATE_NumericIncrementTransformOperation)return{fieldPath:t.field.canonicalString(),increment:r.Pe};throw fail()})(0,e))),t.precondition.isNone||(n.currentDocument=void 0!==(r=t.precondition).updateTime?{updateTime:toTimestamp(e,r.updateTime.toTimestamp())}:void 0!==r.exists?{exists:r.exists}:fail()),n})(this.serializer,e))};this.a_(t)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_DatastoreImpl=class __PRIVATE_DatastoreImpl extends class{}{constructor(e,t,r,n){super(),this.authCredentials=e,this.appCheckCredentials=t,this.connection=r,this.serializer=n,this.y_=!1}w_(){if(this.y_)throw new FirestoreError(p.FAILED_PRECONDITION,"The client has already been terminated.")}Mo(e,t,r,n){return this.w_(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([i,s])=>this.connection.Mo(e,__PRIVATE_toResourcePath(t,r),n,i,s)).catch(e=>{throw"FirebaseError"===e.name?(e.code===p.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),e):new FirestoreError(p.UNKNOWN,e.toString())})}Lo(e,t,r,n,i){return this.w_(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([s,a])=>this.connection.Lo(e,__PRIVATE_toResourcePath(t,r),n,s,a,i)).catch(e=>{throw"FirebaseError"===e.name?(e.code===p.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),e):new FirestoreError(p.UNKNOWN,e.toString())})}terminate(){this.y_=!0,this.connection.terminate()}};let __PRIVATE_OnlineStateTracker=class __PRIVATE_OnlineStateTracker{constructor(e,t){this.asyncQueue=e,this.onlineStateHandler=t,this.state="Unknown",this.S_=0,this.b_=null,this.D_=!0}v_(){0===this.S_&&(this.C_("Unknown"),this.b_=this.asyncQueue.enqueueAfterDelay("online_state_timeout",1e4,()=>(this.b_=null,this.F_("Backend didn't respond within 10 seconds."),this.C_("Offline"),Promise.resolve())))}M_(e){"Online"===this.state?this.C_("Unknown"):(this.S_++,this.S_>=1&&(this.x_(),this.F_(`Connection failed 1 times. Most recent error: ${e.toString()}`),this.C_("Offline")))}set(e){this.x_(),this.S_=0,"Online"===e&&(this.D_=!1),this.C_(e)}C_(e){e!==this.state&&(this.state=e,this.onlineStateHandler(e))}F_(e){let t=`Could not reach Cloud Firestore backend. ${e}
This typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.`;this.D_?(__PRIVATE_logError(t),this.D_=!1):__PRIVATE_logDebug("OnlineStateTracker",t)}x_(){null!==this.b_&&(this.b_.cancel(),this.b_=null)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_RemoteStoreImpl=class __PRIVATE_RemoteStoreImpl{constructor(e,t,r,n,i){this.localStore=e,this.datastore=t,this.asyncQueue=r,this.remoteSyncer={},this.O_=[],this.N_=new Map,this.L_=new Set,this.B_=[],this.k_=i,this.k_._o(e=>{r.enqueueAndForget(async()=>{__PRIVATE_canUseNetwork(this)&&(__PRIVATE_logDebug("RemoteStore","Restarting streams for network reachability change."),await async function(e){e.L_.add(4),await __PRIVATE_disableNetworkInternal(e),e.q_.set("Unknown"),e.L_.delete(4),await __PRIVATE_enableNetworkInternal(e)}(this))})}),this.q_=new __PRIVATE_OnlineStateTracker(r,n)}};async function __PRIVATE_enableNetworkInternal(e){if(__PRIVATE_canUseNetwork(e))for(let t of e.B_)await t(!0)}async function __PRIVATE_disableNetworkInternal(e){for(let t of e.B_)await t(!1)}function __PRIVATE_remoteStoreListen(e,t){e.N_.has(t.targetId)||(e.N_.set(t.targetId,t),__PRIVATE_shouldStartWatchStream(e)?__PRIVATE_startWatchStream(e):__PRIVATE_ensureWatchStream(e).r_()&&__PRIVATE_sendWatchRequest(e,t))}function __PRIVATE_remoteStoreUnlisten(e,t){let r=__PRIVATE_ensureWatchStream(e);e.N_.delete(t),r.r_()&&__PRIVATE_sendUnwatchRequest(e,t),0===e.N_.size&&(r.r_()?r.o_():__PRIVATE_canUseNetwork(e)&&e.q_.set("Unknown"))}function __PRIVATE_sendWatchRequest(e,t){if(e.Q_.xe(t.targetId),t.resumeToken.approximateByteSize()>0||t.snapshotVersion.compareTo(SnapshotVersion.min())>0){let r=e.remoteSyncer.getRemoteKeysForTarget(t.targetId).size;t=t.withExpectedCount(r)}__PRIVATE_ensureWatchStream(e).A_(t)}function __PRIVATE_sendUnwatchRequest(e,t){e.Q_.xe(t),__PRIVATE_ensureWatchStream(e).R_(t)}function __PRIVATE_startWatchStream(e){e.Q_=new __PRIVATE_WatchChangeAggregator({getRemoteKeysForTarget:t=>e.remoteSyncer.getRemoteKeysForTarget(t),ot:t=>e.N_.get(t)||null,tt:()=>e.datastore.serializer.databaseId}),__PRIVATE_ensureWatchStream(e).start(),e.q_.v_()}function __PRIVATE_shouldStartWatchStream(e){return __PRIVATE_canUseNetwork(e)&&!__PRIVATE_ensureWatchStream(e).n_()&&e.N_.size>0}function __PRIVATE_canUseNetwork(e){return 0===e.L_.size}async function __PRIVATE_onWatchStreamConnected(e){e.q_.set("Online")}async function __PRIVATE_onWatchStreamOpen(e){e.N_.forEach((t,r)=>{__PRIVATE_sendWatchRequest(e,t)})}async function __PRIVATE_onWatchStreamClose(e,t){e.Q_=void 0,__PRIVATE_shouldStartWatchStream(e)?(e.q_.M_(t),__PRIVATE_startWatchStream(e)):e.q_.set("Unknown")}async function __PRIVATE_onWatchStreamChange(e,t,r){if(e.q_.set("Online"),t instanceof __PRIVATE_WatchTargetChange&&2===t.state&&t.cause)try{await async function(e,t){let r=t.cause;for(let n of t.targetIds)e.N_.has(n)&&(await e.remoteSyncer.rejectListen(n,r),e.N_.delete(n),e.Q_.removeTarget(n))}(e,t)}catch(r){__PRIVATE_logDebug("RemoteStore","Failed to remove targets %s: %s ",t.targetIds.join(","),r),await __PRIVATE_disableNetworkUntilRecovery(e,r)}else if(t instanceof __PRIVATE_DocumentWatchChange?e.Q_.Ke(t):t instanceof __PRIVATE_ExistenceFilterChange?e.Q_.He(t):e.Q_.We(t),!r.isEqual(SnapshotVersion.min()))try{let t=await __PRIVATE_localStoreGetLastRemoteSnapshotVersion(e.localStore);r.compareTo(t)>=0&&await function(e,t){let r=e.Q_.rt(t);return r.targetChanges.forEach((r,n)=>{if(r.resumeToken.approximateByteSize()>0){let i=e.N_.get(n);i&&e.N_.set(n,i.withResumeToken(r.resumeToken,t))}}),r.targetMismatches.forEach((t,r)=>{let n=e.N_.get(t);if(!n)return;e.N_.set(t,n.withResumeToken(ByteString.EMPTY_BYTE_STRING,n.snapshotVersion)),__PRIVATE_sendUnwatchRequest(e,t);let i=new TargetData(n.target,t,r,n.sequenceNumber);__PRIVATE_sendWatchRequest(e,i)}),e.remoteSyncer.applyRemoteEvent(r)}(e,r)}catch(t){__PRIVATE_logDebug("RemoteStore","Failed to raise snapshot:",t),await __PRIVATE_disableNetworkUntilRecovery(e,t)}}async function __PRIVATE_disableNetworkUntilRecovery(e,t,r){if(!__PRIVATE_isIndexedDbTransactionError(t))throw t;e.L_.add(1),await __PRIVATE_disableNetworkInternal(e),e.q_.set("Offline"),r||(r=()=>__PRIVATE_localStoreGetLastRemoteSnapshotVersion(e.localStore)),e.asyncQueue.enqueueRetryable(async()=>{__PRIVATE_logDebug("RemoteStore","Retrying IndexedDB access"),await r(),e.L_.delete(1),await __PRIVATE_enableNetworkInternal(e)})}function __PRIVATE_executeWithRecovery(e,t){return t().catch(r=>__PRIVATE_disableNetworkUntilRecovery(e,r,t))}async function __PRIVATE_fillWritePipeline(e){let t=__PRIVATE_ensureWriteStream(e),r=e.O_.length>0?e.O_[e.O_.length-1].batchId:-1;for(;__PRIVATE_canUseNetwork(e)&&e.O_.length<10;)try{let n=await function(e,t){return e.persistence.runTransaction("Get next mutation batch","readonly",r=>(void 0===t&&(t=-1),e.mutationQueue.getNextMutationBatchAfterBatchId(r,t)))}(e.localStore,r);if(null===n){0===e.O_.length&&t.o_();break}r=n.batchId,function(e,t){e.O_.push(t);let r=__PRIVATE_ensureWriteStream(e);r.r_()&&r.V_&&r.m_(t.mutations)}(e,n)}catch(t){await __PRIVATE_disableNetworkUntilRecovery(e,t)}__PRIVATE_shouldStartWriteStream(e)&&__PRIVATE_startWriteStream(e)}function __PRIVATE_shouldStartWriteStream(e){return __PRIVATE_canUseNetwork(e)&&!__PRIVATE_ensureWriteStream(e).n_()&&e.O_.length>0}function __PRIVATE_startWriteStream(e){__PRIVATE_ensureWriteStream(e).start()}async function __PRIVATE_onWriteStreamOpen(e){__PRIVATE_ensureWriteStream(e).p_()}async function __PRIVATE_onWriteHandshakeComplete(e){let t=__PRIVATE_ensureWriteStream(e);for(let r of e.O_)t.m_(r.mutations)}async function __PRIVATE_onMutationResult(e,t,r){let n=e.O_.shift(),i=MutationBatchResult.from(n,t,r);await __PRIVATE_executeWithRecovery(e,()=>e.remoteSyncer.applySuccessfulWrite(i)),await __PRIVATE_fillWritePipeline(e)}async function __PRIVATE_onWriteStreamClose(e,t){t&&__PRIVATE_ensureWriteStream(e).V_&&await async function(e,t){var r;if(function(e){switch(e){default:return fail();case p.CANCELLED:case p.UNKNOWN:case p.DEADLINE_EXCEEDED:case p.RESOURCE_EXHAUSTED:case p.INTERNAL:case p.UNAVAILABLE:case p.UNAUTHENTICATED:return!1;case p.INVALID_ARGUMENT:case p.NOT_FOUND:case p.ALREADY_EXISTS:case p.PERMISSION_DENIED:case p.FAILED_PRECONDITION:case p.ABORTED:case p.OUT_OF_RANGE:case p.UNIMPLEMENTED:case p.DATA_LOSS:return!0}}(r=t.code)&&r!==p.ABORTED){let r=e.O_.shift();__PRIVATE_ensureWriteStream(e).s_(),await __PRIVATE_executeWithRecovery(e,()=>e.remoteSyncer.rejectFailedWrite(r.batchId,t)),await __PRIVATE_fillWritePipeline(e)}}(e,t),__PRIVATE_shouldStartWriteStream(e)&&__PRIVATE_startWriteStream(e)}async function __PRIVATE_remoteStoreHandleCredentialChange(e,t){e.asyncQueue.verifyOperationInProgress(),__PRIVATE_logDebug("RemoteStore","RemoteStore received new credentials");let r=__PRIVATE_canUseNetwork(e);e.L_.add(3),await __PRIVATE_disableNetworkInternal(e),r&&e.q_.set("Unknown"),await e.remoteSyncer.handleCredentialChange(t),e.L_.delete(3),await __PRIVATE_enableNetworkInternal(e)}async function __PRIVATE_remoteStoreApplyPrimaryState(e,t){t?(e.L_.delete(2),await __PRIVATE_enableNetworkInternal(e)):t||(e.L_.add(2),await __PRIVATE_disableNetworkInternal(e),e.q_.set("Unknown"))}function __PRIVATE_ensureWatchStream(e){var t,r,n;return e.K_||(e.K_=(t=e.datastore,r=e.asyncQueue,n={Eo:__PRIVATE_onWatchStreamConnected.bind(null,e),Ro:__PRIVATE_onWatchStreamOpen.bind(null,e),mo:__PRIVATE_onWatchStreamClose.bind(null,e),d_:__PRIVATE_onWatchStreamChange.bind(null,e)},t.w_(),new __PRIVATE_PersistentListenStream(r,t.connection,t.authCredentials,t.appCheckCredentials,t.serializer,n)),e.B_.push(async t=>{t?(e.K_.s_(),__PRIVATE_shouldStartWatchStream(e)?__PRIVATE_startWatchStream(e):e.q_.set("Unknown")):(await e.K_.stop(),e.Q_=void 0)})),e.K_}function __PRIVATE_ensureWriteStream(e){var t,r,n;return e.U_||(e.U_=(t=e.datastore,r=e.asyncQueue,n={Eo:()=>Promise.resolve(),Ro:__PRIVATE_onWriteStreamOpen.bind(null,e),mo:__PRIVATE_onWriteStreamClose.bind(null,e),f_:__PRIVATE_onWriteHandshakeComplete.bind(null,e),g_:__PRIVATE_onMutationResult.bind(null,e)},t.w_(),new __PRIVATE_PersistentWriteStream(r,t.connection,t.authCredentials,t.appCheckCredentials,t.serializer,n)),e.B_.push(async t=>{t?(e.U_.s_(),await __PRIVATE_fillWritePipeline(e)):(await e.U_.stop(),e.O_.length>0&&(__PRIVATE_logDebug("RemoteStore",`Stopping write stream with ${e.O_.length} pending writes`),e.O_=[]))})),e.U_}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let DelayedOperation=class DelayedOperation{constructor(e,t,r,n,i){this.asyncQueue=e,this.timerId=t,this.targetTimeMs=r,this.op=n,this.removalCallback=i,this.deferred=new __PRIVATE_Deferred,this.then=this.deferred.promise.then.bind(this.deferred.promise),this.deferred.promise.catch(e=>{})}get promise(){return this.deferred.promise}static createAndSchedule(e,t,r,n,i){let s=Date.now()+r,a=new DelayedOperation(e,t,s,n,i);return a.start(r),a}start(e){this.timerHandle=setTimeout(()=>this.handleDelayElapsed(),e)}skipDelay(){return this.handleDelayElapsed()}cancel(e){null!==this.timerHandle&&(this.clearTimeout(),this.deferred.reject(new FirestoreError(p.CANCELLED,"Operation cancelled"+(e?": "+e:""))))}handleDelayElapsed(){this.asyncQueue.enqueueAndForget(()=>null!==this.timerHandle?(this.clearTimeout(),this.op().then(e=>this.deferred.resolve(e))):Promise.resolve())}clearTimeout(){null!==this.timerHandle&&(this.removalCallback(this),clearTimeout(this.timerHandle),this.timerHandle=null)}};function __PRIVATE_wrapInUserErrorIfRecoverable(e,t){if(__PRIVATE_logError("AsyncQueue",`${t}: ${e}`),__PRIVATE_isIndexedDbTransactionError(e))return new FirestoreError(p.UNAVAILABLE,`${t}: ${e}`);throw e}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let DocumentSet=class DocumentSet{constructor(e){this.comparator=e?(t,r)=>e(t,r)||DocumentKey.comparator(t.key,r.key):(e,t)=>DocumentKey.comparator(e.key,t.key),this.keyedMap=documentMap(),this.sortedSet=new SortedMap(this.comparator)}static emptySet(e){return new DocumentSet(e.comparator)}has(e){return null!=this.keyedMap.get(e)}get(e){return this.keyedMap.get(e)}first(){return this.sortedSet.minKey()}last(){return this.sortedSet.maxKey()}isEmpty(){return this.sortedSet.isEmpty()}indexOf(e){let t=this.keyedMap.get(e);return t?this.sortedSet.indexOf(t):-1}get size(){return this.sortedSet.size}forEach(e){this.sortedSet.inorderTraversal((t,r)=>(e(t),!1))}add(e){let t=this.delete(e.key);return t.copy(t.keyedMap.insert(e.key,e),t.sortedSet.insert(e,null))}delete(e){let t=this.get(e);return t?this.copy(this.keyedMap.remove(e),this.sortedSet.remove(t)):this}isEqual(e){if(!(e instanceof DocumentSet)||this.size!==e.size)return!1;let t=this.sortedSet.getIterator(),r=e.sortedSet.getIterator();for(;t.hasNext();){let e=t.getNext().key,n=r.getNext().key;if(!e.isEqual(n))return!1}return!0}toString(){let e=[];return this.forEach(t=>{e.push(t.toString())}),0===e.length?"DocumentSet ()":"DocumentSet (\n  "+e.join("  \n")+"\n)"}copy(e,t){let r=new DocumentSet;return r.comparator=this.comparator,r.keyedMap=e,r.sortedSet=t,r}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_DocumentChangeSet=class __PRIVATE_DocumentChangeSet{constructor(){this.W_=new SortedMap(DocumentKey.comparator)}track(e){let t=e.doc.key,r=this.W_.get(t);r?0!==e.type&&3===r.type?this.W_=this.W_.insert(t,e):3===e.type&&1!==r.type?this.W_=this.W_.insert(t,{type:r.type,doc:e.doc}):2===e.type&&2===r.type?this.W_=this.W_.insert(t,{type:2,doc:e.doc}):2===e.type&&0===r.type?this.W_=this.W_.insert(t,{type:0,doc:e.doc}):1===e.type&&0===r.type?this.W_=this.W_.remove(t):1===e.type&&2===r.type?this.W_=this.W_.insert(t,{type:1,doc:r.doc}):0===e.type&&1===r.type?this.W_=this.W_.insert(t,{type:2,doc:e.doc}):fail():this.W_=this.W_.insert(t,e)}G_(){let e=[];return this.W_.inorderTraversal((t,r)=>{e.push(r)}),e}};let ViewSnapshot=class ViewSnapshot{constructor(e,t,r,n,i,s,a,o,l){this.query=e,this.docs=t,this.oldDocs=r,this.docChanges=n,this.mutatedKeys=i,this.fromCache=s,this.syncStateChanged=a,this.excludesMetadataChanges=o,this.hasCachedResults=l}static fromInitialDocuments(e,t,r,n,i){let s=[];return t.forEach(e=>{s.push({type:0,doc:e})}),new ViewSnapshot(e,t,DocumentSet.emptySet(t),s,r,n,!0,!1,i)}get hasPendingWrites(){return!this.mutatedKeys.isEmpty()}isEqual(e){if(!(this.fromCache===e.fromCache&&this.hasCachedResults===e.hasCachedResults&&this.syncStateChanged===e.syncStateChanged&&this.mutatedKeys.isEqual(e.mutatedKeys)&&__PRIVATE_queryEquals(this.query,e.query)&&this.docs.isEqual(e.docs)&&this.oldDocs.isEqual(e.oldDocs)))return!1;let t=this.docChanges,r=e.docChanges;if(t.length!==r.length)return!1;for(let e=0;e<t.length;e++)if(t[e].type!==r[e].type||!t[e].doc.isEqual(r[e].doc))return!1;return!0}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_QueryListenersInfo=class __PRIVATE_QueryListenersInfo{constructor(){this.z_=void 0,this.j_=[]}H_(){return this.j_.some(e=>e.J_())}};let __PRIVATE_EventManagerImpl=class __PRIVATE_EventManagerImpl{constructor(){this.queries=__PRIVATE_newQueriesObjectMap(),this.onlineState="Unknown",this.Y_=new Set}terminate(){!function(e,t){let r=e.queries;e.queries=__PRIVATE_newQueriesObjectMap(),r.forEach((e,r)=>{for(let e of r.j_)e.onError(t)})}(this,new FirestoreError(p.ABORTED,"Firestore shutting down"))}};function __PRIVATE_newQueriesObjectMap(){return new ObjectMap(e=>__PRIVATE_canonifyQuery(e),__PRIVATE_queryEquals)}async function __PRIVATE_eventManagerListen(e,t){let r=3,n=t.query,i=e.queries.get(n);i?!i.H_()&&t.J_()&&(r=2):(i=new __PRIVATE_QueryListenersInfo,r=t.J_()?0:1);try{switch(r){case 0:i.z_=await e.onListen(n,!0);break;case 1:i.z_=await e.onListen(n,!1);break;case 2:await e.onFirstRemoteStoreListen(n)}}catch(r){let e=__PRIVATE_wrapInUserErrorIfRecoverable(r,`Initialization of query '${__PRIVATE_stringifyQuery(t.query)}' failed`);return void t.onError(e)}e.queries.set(n,i),i.j_.push(t),t.Z_(e.onlineState),i.z_&&t.X_(i.z_)&&__PRIVATE_raiseSnapshotsInSyncEvent(e)}async function __PRIVATE_eventManagerUnlisten(e,t){let r=t.query,n=3,i=e.queries.get(r);if(i){let e=i.j_.indexOf(t);e>=0&&(i.j_.splice(e,1),0===i.j_.length?n=t.J_()?0:1:!i.H_()&&t.J_()&&(n=2))}switch(n){case 0:return e.queries.delete(r),e.onUnlisten(r,!0);case 1:return e.queries.delete(r),e.onUnlisten(r,!1);case 2:return e.onLastRemoteStoreUnlisten(r);default:return}}function __PRIVATE_eventManagerOnWatchChange(e,t){let r=!1;for(let n of t){let t=n.query,i=e.queries.get(t);if(i){for(let e of i.j_)e.X_(n)&&(r=!0);i.z_=n}}r&&__PRIVATE_raiseSnapshotsInSyncEvent(e)}function __PRIVATE_eventManagerOnWatchError(e,t,r){let n=e.queries.get(t);if(n)for(let e of n.j_)e.onError(r);e.queries.delete(t)}function __PRIVATE_raiseSnapshotsInSyncEvent(e){e.Y_.forEach(e=>{e.next()})}(a=s||(s={})).ea="default",a.Cache="cache";let __PRIVATE_QueryListener=class __PRIVATE_QueryListener{constructor(e,t,r){this.query=e,this.ta=t,this.na=!1,this.ra=null,this.onlineState="Unknown",this.options=r||{}}X_(e){if(!this.options.includeMetadataChanges){let t=[];for(let r of e.docChanges)3!==r.type&&t.push(r);e=new ViewSnapshot(e.query,e.docs,e.oldDocs,t,e.mutatedKeys,e.fromCache,e.syncStateChanged,!0,e.hasCachedResults)}let t=!1;return this.na?this.ia(e)&&(this.ta.next(e),t=!0):this.sa(e,this.onlineState)&&(this.oa(e),t=!0),this.ra=e,t}onError(e){this.ta.error(e)}Z_(e){this.onlineState=e;let t=!1;return this.ra&&!this.na&&this.sa(this.ra,e)&&(this.oa(this.ra),t=!0),t}sa(e,t){return!(e.fromCache&&this.J_())||(!this.options._a||!("Offline"!==t))&&(!e.docs.isEmpty()||e.hasCachedResults||"Offline"===t)}ia(e){if(e.docChanges.length>0)return!0;let t=this.ra&&this.ra.hasPendingWrites!==e.hasPendingWrites;return!(!e.syncStateChanged&&!t)&&!0===this.options.includeMetadataChanges}oa(e){e=ViewSnapshot.fromInitialDocuments(e.query,e.docs,e.mutatedKeys,e.fromCache,e.hasCachedResults),this.na=!0,this.ta.next(e)}J_(){return this.options.source!==s.Cache}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_AddedLimboDocument=class __PRIVATE_AddedLimboDocument{constructor(e){this.key=e}};let __PRIVATE_RemovedLimboDocument=class __PRIVATE_RemovedLimboDocument{constructor(e){this.key=e}};let __PRIVATE_View=class __PRIVATE_View{constructor(e,t){this.query=e,this.Ta=t,this.Ea=null,this.hasCachedResults=!1,this.current=!1,this.da=__PRIVATE_documentKeySet(),this.mutatedKeys=__PRIVATE_documentKeySet(),this.Aa=__PRIVATE_newQueryComparator(e),this.Ra=new DocumentSet(this.Aa)}get Va(){return this.Ta}ma(e,t){let r=t?t.fa:new __PRIVATE_DocumentChangeSet,n=t?t.Ra:this.Ra,i=t?t.mutatedKeys:this.mutatedKeys,s=n,a=!1,o="F"===this.query.limitType&&n.size===this.query.limit?n.last():null,l="L"===this.query.limitType&&n.size===this.query.limit?n.first():null;if(e.inorderTraversal((e,t)=>{let u=n.get(e),c=__PRIVATE_queryMatches(this.query,t)?t:null,_=!!u&&this.mutatedKeys.has(u.key),h=!!c&&(c.hasLocalMutations||this.mutatedKeys.has(c.key)&&c.hasCommittedMutations),d=!1;u&&c?u.data.isEqual(c.data)?_!==h&&(r.track({type:3,doc:c}),d=!0):this.ga(u,c)||(r.track({type:2,doc:c}),d=!0,(o&&this.Aa(c,o)>0||l&&0>this.Aa(c,l))&&(a=!0)):!u&&c?(r.track({type:0,doc:c}),d=!0):u&&!c&&(r.track({type:1,doc:u}),d=!0,(o||l)&&(a=!0)),d&&(c?(s=s.add(c),i=h?i.add(e):i.delete(e)):(s=s.delete(e),i=i.delete(e)))}),null!==this.query.limit)for(;s.size>this.query.limit;){let e="F"===this.query.limitType?s.last():s.first();s=s.delete(e.key),i=i.delete(e.key),r.track({type:1,doc:e})}return{Ra:s,fa:r,ns:a,mutatedKeys:i}}ga(e,t){return e.hasLocalMutations&&t.hasCommittedMutations&&!t.hasLocalMutations}applyChanges(e,t,r,n){let i=this.Ra;this.Ra=e.Ra,this.mutatedKeys=e.mutatedKeys;let s=e.fa.G_();s.sort((e,t)=>(function(e,t){let order=e=>{switch(e){case 0:return 1;case 2:case 3:return 2;case 1:return 0;default:return fail()}};return order(e)-order(t)})(e.type,t.type)||this.Aa(e.doc,t.doc)),this.pa(r),n=null!=n&&n;let a=t&&!n?this.ya():[],o=0===this.da.size&&this.current&&!n?1:0,l=o!==this.Ea;return(this.Ea=o,0!==s.length||l)?{snapshot:new ViewSnapshot(this.query,e.Ra,i,s,e.mutatedKeys,0===o,l,!1,!!r&&r.resumeToken.approximateByteSize()>0),wa:a}:{wa:a}}Z_(e){return this.current&&"Offline"===e?(this.current=!1,this.applyChanges({Ra:this.Ra,fa:new __PRIVATE_DocumentChangeSet,mutatedKeys:this.mutatedKeys,ns:!1},!1)):{wa:[]}}Sa(e){return!this.Ta.has(e)&&!!this.Ra.has(e)&&!this.Ra.get(e).hasLocalMutations}pa(e){e&&(e.addedDocuments.forEach(e=>this.Ta=this.Ta.add(e)),e.modifiedDocuments.forEach(e=>{}),e.removedDocuments.forEach(e=>this.Ta=this.Ta.delete(e)),this.current=e.current)}ya(){if(!this.current)return[];let e=this.da;this.da=__PRIVATE_documentKeySet(),this.Ra.forEach(e=>{this.Sa(e.key)&&(this.da=this.da.add(e.key))});let t=[];return e.forEach(e=>{this.da.has(e)||t.push(new __PRIVATE_RemovedLimboDocument(e))}),this.da.forEach(r=>{e.has(r)||t.push(new __PRIVATE_AddedLimboDocument(r))}),t}ba(e){this.Ta=e.Ts,this.da=__PRIVATE_documentKeySet();let t=this.ma(e.documents);return this.applyChanges(t,!0)}Da(){return ViewSnapshot.fromInitialDocuments(this.query,this.Ra,this.mutatedKeys,0===this.Ea,this.hasCachedResults)}};let __PRIVATE_QueryView=class __PRIVATE_QueryView{constructor(e,t,r){this.query=e,this.targetId=t,this.view=r}};let LimboResolution=class LimboResolution{constructor(e){this.key=e,this.va=!1}};let __PRIVATE_SyncEngineImpl=class __PRIVATE_SyncEngineImpl{constructor(e,t,r,n,i,s){this.localStore=e,this.remoteStore=t,this.eventManager=r,this.sharedClientState=n,this.currentUser=i,this.maxConcurrentLimboResolutions=s,this.Ca={},this.Fa=new ObjectMap(e=>__PRIVATE_canonifyQuery(e),__PRIVATE_queryEquals),this.Ma=new Map,this.xa=new Set,this.Oa=new SortedMap(DocumentKey.comparator),this.Na=new Map,this.La=new __PRIVATE_ReferenceSet,this.Ba={},this.ka=new Map,this.qa=__PRIVATE_TargetIdGenerator.kn(),this.onlineState="Unknown",this.Qa=void 0}get isPrimaryClient(){return!0===this.Qa}};async function __PRIVATE_syncEngineListen(e,t,r=!0){let n;let i=__PRIVATE_ensureWatchCallbacks(e),s=i.Fa.get(t);return s?(i.sharedClientState.addLocalQueryTarget(s.targetId),n=s.view.Da()):n=await __PRIVATE_allocateTargetAndMaybeListen(i,t,r,!0),n}async function __PRIVATE_triggerRemoteStoreListen(e,t){let r=__PRIVATE_ensureWatchCallbacks(e);await __PRIVATE_allocateTargetAndMaybeListen(r,t,!0,!1)}async function __PRIVATE_allocateTargetAndMaybeListen(e,t,r,n){var i,s;let a;let o=await (i=e.localStore,s=__PRIVATE_queryToTarget(t),i.persistence.runTransaction("Allocate target","readwrite",e=>{let t;return i.Ur.getTargetData(e,s).next(r=>r?(t=r,PersistencePromise.resolve(t)):i.Ur.allocateTargetId(e).next(r=>(t=new TargetData(s,r,"TargetPurposeListen",e.currentSequenceNumber),i.Ur.addTargetData(e,t).next(()=>t))))}).then(e=>{let t=i.os.get(e.targetId);return(null===t||e.snapshotVersion.compareTo(t.snapshotVersion)>0)&&(i.os=i.os.insert(e.targetId,e),i._s.set(s,e.targetId)),e})),l=o.targetId,u=e.sharedClientState.addLocalQueryTarget(l,r);return n&&(a=await __PRIVATE_initializeViewAndComputeSnapshot(e,t,l,"current"===u,o.resumeToken)),e.isPrimaryClient&&r&&__PRIVATE_remoteStoreListen(e.remoteStore,o),a}async function __PRIVATE_initializeViewAndComputeSnapshot(e,t,r,n,i){e.Ka=(t,r,n)=>(async function(e,t,r,n){let i=t.view.ma(r);i.ns&&(i=await __PRIVATE_localStoreExecuteQuery(e.localStore,t.query,!1).then(({documents:e})=>t.view.ma(e,i)));let s=n&&n.targetChanges.get(t.targetId),a=n&&null!=n.targetMismatches.get(t.targetId),o=t.view.applyChanges(i,e.isPrimaryClient,s,a);return __PRIVATE_updateTrackedLimbos(e,t.targetId,o.wa),o.snapshot})(e,t,r,n);let s=await __PRIVATE_localStoreExecuteQuery(e.localStore,t,!0),a=new __PRIVATE_View(t,s.Ts),o=a.ma(s.documents),l=TargetChange.createSynthesizedTargetChangeForCurrentChange(r,n&&"Offline"!==e.onlineState,i),u=a.applyChanges(o,e.isPrimaryClient,l);__PRIVATE_updateTrackedLimbos(e,r,u.wa);let c=new __PRIVATE_QueryView(t,r,a);return e.Fa.set(t,c),e.Ma.has(r)?e.Ma.get(r).push(t):e.Ma.set(r,[t]),u.snapshot}async function __PRIVATE_syncEngineUnlisten(e,t,r){let n=e.Fa.get(t),i=e.Ma.get(n.targetId);if(i.length>1)return e.Ma.set(n.targetId,i.filter(e=>!__PRIVATE_queryEquals(e,t))),void e.Fa.delete(t);e.isPrimaryClient?(e.sharedClientState.removeLocalQueryTarget(n.targetId),e.sharedClientState.isActiveQueryTarget(n.targetId)||await __PRIVATE_localStoreReleaseTarget(e.localStore,n.targetId,!1).then(()=>{e.sharedClientState.clearQueryState(n.targetId),r&&__PRIVATE_remoteStoreUnlisten(e.remoteStore,n.targetId),__PRIVATE_removeAndCleanupTarget(e,n.targetId)}).catch(__PRIVATE_ignoreIfPrimaryLeaseLoss)):(__PRIVATE_removeAndCleanupTarget(e,n.targetId),await __PRIVATE_localStoreReleaseTarget(e.localStore,n.targetId,!0))}async function __PRIVATE_triggerRemoteStoreUnlisten(e,t){let r=e.Fa.get(t),n=e.Ma.get(r.targetId);e.isPrimaryClient&&1===n.length&&(e.sharedClientState.removeLocalQueryTarget(r.targetId),__PRIVATE_remoteStoreUnlisten(e.remoteStore,r.targetId))}async function __PRIVATE_syncEngineWrite(e,t,r){var n;let i=(e.remoteStore.remoteSyncer.applySuccessfulWrite=__PRIVATE_syncEngineApplySuccessfulWrite.bind(null,e),e.remoteStore.remoteSyncer.rejectFailedWrite=__PRIVATE_syncEngineRejectFailedWrite.bind(null,e),e);try{let e;let s=await function(e,t){let r,n;let i=Timestamp.now(),s=t.reduce((e,t)=>e.add(t.key),__PRIVATE_documentKeySet());return e.persistence.runTransaction("Locally write mutations","readwrite",a=>{let o=P,l=__PRIVATE_documentKeySet();return e.cs.getEntries(a,s).next(e=>{(o=e).forEach((e,t)=>{t.isValidDocument()||(l=l.add(e))})}).next(()=>e.localDocuments.getOverlayedDocuments(a,o)).next(n=>{r=n;let s=[];for(let e of t){let t=function(e,t){let r=null;for(let n of e.fieldTransforms){let e=t.data.field(n.field),i=__PRIVATE_computeTransformOperationBaseValue(n.transform,e||null);null!=i&&(null===r&&(r=ObjectValue.empty()),r.set(n.field,i))}return r||null}(e,r.get(e.key).overlayedDocument);null!=t&&s.push(new __PRIVATE_PatchMutation(e.key,t,function __PRIVATE_extractFieldMask(e){let t=[];return forEach(e.fields,(e,r)=>{let n=new FieldPath$1([e]);if(__PRIVATE_isMapValue(r)){let e=__PRIVATE_extractFieldMask(r.mapValue).fields;if(0===e.length)t.push(n);else for(let r of e)t.push(n.child(r))}else t.push(n)}),new FieldMask(t)}(t.value.mapValue),Precondition.exists(!0)))}return e.mutationQueue.addMutationBatch(a,i,s,t)}).next(t=>{n=t;let i=t.applyToLocalDocumentSet(r,l);return e.documentOverlayCache.saveOverlays(a,t.batchId,i)})}).then(()=>({batchId:n.batchId,changes:__PRIVATE_convertOverlayedDocumentMapToDocumentMap(r)}))}(i.localStore,t);i.sharedClientState.addPendingMutation(s.batchId),n=s.batchId,(e=i.Ba[i.currentUser.toKey()])||(e=new SortedMap(__PRIVATE_primitiveComparator)),e=e.insert(n,r),i.Ba[i.currentUser.toKey()]=e,await __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(i,s.changes),await __PRIVATE_fillWritePipeline(i.remoteStore)}catch(t){let e=__PRIVATE_wrapInUserErrorIfRecoverable(t,"Failed to persist write");r.reject(e)}}async function __PRIVATE_syncEngineApplyRemoteEvent(e,t){try{let r=await function(e,t){let r=t.snapshotVersion,n=e.os;return e.persistence.runTransaction("Apply remote event","readwrite-primary",i=>{var s;let a,o;let l=e.cs.newChangeBuffer({trackRemovals:!0});n=e.os;let u=[];t.targetChanges.forEach((s,a)=>{var o;let l=n.get(a);if(!l)return;u.push(e.Ur.removeMatchingKeys(i,s.removedDocuments,a).next(()=>e.Ur.addMatchingKeys(i,s.addedDocuments,a)));let c=l.withSequenceNumber(i.currentSequenceNumber);null!==t.targetMismatches.get(a)?c=c.withResumeToken(ByteString.EMPTY_BYTE_STRING,SnapshotVersion.min()).withLastLimboFreeSnapshotVersion(SnapshotVersion.min()):s.resumeToken.approximateByteSize()>0&&(c=c.withResumeToken(s.resumeToken,r)),n=n.insert(a,c),o=c,(0===l.resumeToken.approximateByteSize()||o.snapshotVersion.toMicroseconds()-l.snapshotVersion.toMicroseconds()>=3e8||s.addedDocuments.size+s.modifiedDocuments.size+s.removedDocuments.size>0)&&u.push(e.Ur.updateTargetData(i,c))});let c=P,_=__PRIVATE_documentKeySet();if(t.documentUpdates.forEach(r=>{t.resolvedLimboDocuments.has(r)&&u.push(e.persistence.referenceDelegate.updateLimboDocument(i,r))}),u.push((s=t.documentUpdates,a=__PRIVATE_documentKeySet(),o=__PRIVATE_documentKeySet(),s.forEach(e=>a=a.add(e)),l.getEntries(i,a).next(e=>{let t=P;return s.forEach((r,n)=>{let i=e.get(r);n.isFoundDocument()!==i.isFoundDocument()&&(o=o.add(r)),n.isNoDocument()&&n.version.isEqual(SnapshotVersion.min())?(l.removeEntry(r,n.readTime),t=t.insert(r,n)):!i.isValidDocument()||n.version.compareTo(i.version)>0||0===n.version.compareTo(i.version)&&i.hasPendingWrites?(l.addEntry(n),t=t.insert(r,n)):__PRIVATE_logDebug("LocalStore","Ignoring outdated watch update for ",r,". Current version:",i.version," Watch version:",n.version)}),{Ps:t,Is:o}})).next(e=>{c=e.Ps,_=e.Is})),!r.isEqual(SnapshotVersion.min())){let t=e.Ur.getLastRemoteSnapshotVersion(i).next(t=>e.Ur.setTargetsMetadata(i,i.currentSequenceNumber,r));u.push(t)}return PersistencePromise.waitFor(u).next(()=>l.apply(i)).next(()=>e.localDocuments.getLocalViewOfDocuments(i,c,_)).next(()=>c)}).then(t=>(e.os=n,t))}(e.localStore,t);t.targetChanges.forEach((t,r)=>{let n=e.Na.get(r);n&&(t.addedDocuments.size+t.modifiedDocuments.size+t.removedDocuments.size<=1||fail(),t.addedDocuments.size>0?n.va=!0:t.modifiedDocuments.size>0?n.va||fail():t.removedDocuments.size>0&&(n.va||fail(),n.va=!1))}),await __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(e,r,t)}catch(e){await __PRIVATE_ignoreIfPrimaryLeaseLoss(e)}}function __PRIVATE_syncEngineApplyOnlineStateChange(e,t,r){var n;if(e.isPrimaryClient&&0===r||!e.isPrimaryClient&&1===r){let r;let i=[];e.Fa.forEach((e,r)=>{let n=r.view.Z_(t);n.snapshot&&i.push(n.snapshot)}),(n=e.eventManager).onlineState=t,r=!1,n.queries.forEach((e,n)=>{for(let e of n.j_)e.Z_(t)&&(r=!0)}),r&&__PRIVATE_raiseSnapshotsInSyncEvent(n),i.length&&e.Ca.d_(i),e.onlineState=t,e.isPrimaryClient&&e.sharedClientState.setOnlineState(t)}}async function __PRIVATE_syncEngineRejectListen(e,t,r){e.sharedClientState.updateQueryState(t,"rejected",r);let n=e.Na.get(t),i=n&&n.key;if(i){let r=new SortedMap(DocumentKey.comparator);r=r.insert(i,MutableDocument.newNoDocument(i,SnapshotVersion.min()));let n=__PRIVATE_documentKeySet().add(i),s=new RemoteEvent(SnapshotVersion.min(),new Map,new SortedMap(__PRIVATE_primitiveComparator),r,n);await __PRIVATE_syncEngineApplyRemoteEvent(e,s),e.Oa=e.Oa.remove(i),e.Na.delete(t),__PRIVATE_pumpEnqueuedLimboResolutions(e)}else await __PRIVATE_localStoreReleaseTarget(e.localStore,t,!1).then(()=>__PRIVATE_removeAndCleanupTarget(e,t,r)).catch(__PRIVATE_ignoreIfPrimaryLeaseLoss)}async function __PRIVATE_syncEngineApplySuccessfulWrite(e,t){var r;let n=t.batch.batchId;try{let i=await (r=e.localStore).persistence.runTransaction("Acknowledge batch","readwrite-primary",e=>{let n=t.batch.keys(),i=r.cs.newChangeBuffer({trackRemovals:!0});return(function(e,t,r,n){let i=r.batch,s=i.keys(),a=PersistencePromise.resolve();return s.forEach(e=>{a=a.next(()=>n.getEntry(t,e)).next(t=>{let s=r.docVersions.get(e);null!==s||fail(),0>t.version.compareTo(s)&&(i.applyToRemoteDocument(t,r),t.isValidDocument()&&(t.setReadTime(r.commitVersion),n.addEntry(t)))})}),a.next(()=>e.mutationQueue.removeMutationBatch(t,i))})(r,e,t,i).next(()=>i.apply(e)).next(()=>r.mutationQueue.performConsistencyCheck(e)).next(()=>r.documentOverlayCache.removeOverlaysForBatchId(e,n,t.batch.batchId)).next(()=>r.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(e,function(e){let t=__PRIVATE_documentKeySet();for(let r=0;r<e.mutationResults.length;++r)e.mutationResults[r].transformResults.length>0&&(t=t.add(e.batch.mutations[r].key));return t}(t))).next(()=>r.localDocuments.getDocuments(e,n))});__PRIVATE_processUserCallback(e,n,null),__PRIVATE_triggerPendingWritesCallbacks(e,n),e.sharedClientState.updateMutationState(n,"acknowledged"),await __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(e,i)}catch(e){await __PRIVATE_ignoreIfPrimaryLeaseLoss(e)}}async function __PRIVATE_syncEngineRejectFailedWrite(e,t,r){var n;try{let i=await (n=e.localStore).persistence.runTransaction("Reject batch","readwrite-primary",e=>{let r;return n.mutationQueue.lookupMutationBatch(e,t).next(t=>(null!==t||fail(),r=t.keys(),n.mutationQueue.removeMutationBatch(e,t))).next(()=>n.mutationQueue.performConsistencyCheck(e)).next(()=>n.documentOverlayCache.removeOverlaysForBatchId(e,r,t)).next(()=>n.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(e,r)).next(()=>n.localDocuments.getDocuments(e,r))});__PRIVATE_processUserCallback(e,t,r),__PRIVATE_triggerPendingWritesCallbacks(e,t),e.sharedClientState.updateMutationState(t,"rejected",r),await __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(e,i)}catch(e){await __PRIVATE_ignoreIfPrimaryLeaseLoss(e)}}function __PRIVATE_triggerPendingWritesCallbacks(e,t){(e.ka.get(t)||[]).forEach(e=>{e.resolve()}),e.ka.delete(t)}function __PRIVATE_processUserCallback(e,t,r){let n=e.Ba[e.currentUser.toKey()];if(n){let i=n.get(t);i&&(r?i.reject(r):i.resolve(),n=n.remove(t)),e.Ba[e.currentUser.toKey()]=n}}function __PRIVATE_removeAndCleanupTarget(e,t,r=null){for(let n of(e.sharedClientState.removeLocalQueryTarget(t),e.Ma.get(t)))e.Fa.delete(n),r&&e.Ca.$a(n,r);e.Ma.delete(t),e.isPrimaryClient&&e.La.gr(t).forEach(t=>{e.La.containsKey(t)||__PRIVATE_removeLimboTarget(e,t)})}function __PRIVATE_removeLimboTarget(e,t){e.xa.delete(t.path.canonicalString());let r=e.Oa.get(t);null!==r&&(__PRIVATE_remoteStoreUnlisten(e.remoteStore,r),e.Oa=e.Oa.remove(t),e.Na.delete(r),__PRIVATE_pumpEnqueuedLimboResolutions(e))}function __PRIVATE_updateTrackedLimbos(e,t,r){for(let n of r)n instanceof __PRIVATE_AddedLimboDocument?(e.La.addReference(n.key,t),function(e,t){let r=t.key,n=r.path.canonicalString();e.Oa.get(r)||e.xa.has(n)||(__PRIVATE_logDebug("SyncEngine","New document in limbo: "+r),e.xa.add(n),__PRIVATE_pumpEnqueuedLimboResolutions(e))}(e,n)):n instanceof __PRIVATE_RemovedLimboDocument?(__PRIVATE_logDebug("SyncEngine","Document no longer in limbo: "+n.key),e.La.removeReference(n.key,t),e.La.containsKey(n.key)||__PRIVATE_removeLimboTarget(e,n.key)):fail()}function __PRIVATE_pumpEnqueuedLimboResolutions(e){for(;e.xa.size>0&&e.Oa.size<e.maxConcurrentLimboResolutions;){var t;let r=e.xa.values().next().value;e.xa.delete(r);let n=new DocumentKey(ResourcePath.fromString(r)),i=e.qa.next();e.Na.set(i,new LimboResolution(n)),e.Oa=e.Oa.insert(n,i),__PRIVATE_remoteStoreListen(e.remoteStore,new TargetData(__PRIVATE_queryToTarget((t=n.path,new __PRIVATE_QueryImpl(t))),i,"TargetPurposeLimboResolution",__PRIVATE_ListenSequence.oe))}}async function __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(e,t,r){let n=[],i=[],s=[];e.Fa.isEmpty()||(e.Fa.forEach((a,o)=>{s.push(e.Ka(o,t,r).then(t=>{var s;if((t||r)&&e.isPrimaryClient){let n=t?!t.fromCache:null===(s=null==r?void 0:r.targetChanges.get(o.targetId))||void 0===s?void 0:s.current;e.sharedClientState.updateQueryState(o.targetId,n?"current":"not-current")}if(t){n.push(t);let e=__PRIVATE_LocalViewChanges.Wi(o.targetId,t);i.push(e)}}))}),await Promise.all(s),e.Ca.d_(n),await async function(e,t){try{await e.persistence.runTransaction("notifyLocalViewChanges","readwrite",r=>PersistencePromise.forEach(t,t=>PersistencePromise.forEach(t.$i,n=>e.persistence.referenceDelegate.addReference(r,t.targetId,n)).next(()=>PersistencePromise.forEach(t.Ui,n=>e.persistence.referenceDelegate.removeReference(r,t.targetId,n)))))}catch(e){if(!__PRIVATE_isIndexedDbTransactionError(e))throw e;__PRIVATE_logDebug("LocalStore","Failed to update sequence numbers: "+e)}for(let r of t){let t=r.targetId;if(!r.fromCache){let r=e.os.get(t),n=r.snapshotVersion,i=r.withLastLimboFreeSnapshotVersion(n);e.os=e.os.insert(t,i)}}}(e.localStore,i))}async function __PRIVATE_syncEngineHandleCredentialChange(e,t){if(!e.currentUser.isEqual(t)){__PRIVATE_logDebug("SyncEngine","User change. New user:",t.toKey());let r=await __PRIVATE_localStoreHandleUserChange(e.localStore,t);e.currentUser=t,e.ka.forEach(e=>{e.forEach(e=>{e.reject(new FirestoreError(p.CANCELLED,"'waitForPendingWrites' promise is rejected due to a user change."))})}),e.ka.clear(),e.sharedClientState.handleUserChange(t,r.removedBatchIds,r.addedBatchIds),await __PRIVATE_syncEngineEmitNewSnapsAndNotifyLocalStore(e,r.hs)}}function __PRIVATE_syncEngineGetRemoteKeysForTarget(e,t){let r=e.Na.get(t);if(r&&r.va)return __PRIVATE_documentKeySet().add(r.key);{let r=__PRIVATE_documentKeySet(),n=e.Ma.get(t);if(!n)return r;for(let t of n){let n=e.Fa.get(t);r=r.unionWith(n.view.Va)}return r}}function __PRIVATE_ensureWatchCallbacks(e){return e.remoteStore.remoteSyncer.applyRemoteEvent=__PRIVATE_syncEngineApplyRemoteEvent.bind(null,e),e.remoteStore.remoteSyncer.getRemoteKeysForTarget=__PRIVATE_syncEngineGetRemoteKeysForTarget.bind(null,e),e.remoteStore.remoteSyncer.rejectListen=__PRIVATE_syncEngineRejectListen.bind(null,e),e.Ca.d_=__PRIVATE_eventManagerOnWatchChange.bind(null,e.eventManager),e.Ca.$a=__PRIVATE_eventManagerOnWatchError.bind(null,e.eventManager),e}let __PRIVATE_MemoryOfflineComponentProvider=class __PRIVATE_MemoryOfflineComponentProvider{constructor(){this.kind="memory",this.synchronizeTabs=!1}async initialize(e){this.serializer=__PRIVATE_newSerializer(e.databaseInfo.databaseId),this.sharedClientState=this.Wa(e),this.persistence=this.Ga(e),await this.persistence.start(),this.localStore=this.za(e),this.gcScheduler=this.ja(e,this.localStore),this.indexBackfillerScheduler=this.Ha(e,this.localStore)}ja(e,t){return null}Ha(e,t){return null}za(e){var t,r,n,i;return t=this.persistence,r=new __PRIVATE_QueryEngine,n=e.initialUser,i=this.serializer,new __PRIVATE_LocalStoreImpl(t,r,n,i)}Ga(e){return new __PRIVATE_MemoryPersistence(__PRIVATE_MemoryEagerDelegate.Zr,this.serializer)}Wa(e){return new __PRIVATE_MemorySharedClientState}async terminate(){var e,t;null===(e=this.gcScheduler)||void 0===e||e.stop(),null===(t=this.indexBackfillerScheduler)||void 0===t||t.stop(),this.sharedClientState.shutdown(),await this.persistence.shutdown()}};__PRIVATE_MemoryOfflineComponentProvider.provider={build:()=>new __PRIVATE_MemoryOfflineComponentProvider};let OnlineComponentProvider=class OnlineComponentProvider{async initialize(e,t){this.localStore||(this.localStore=e.localStore,this.sharedClientState=e.sharedClientState,this.datastore=this.createDatastore(t),this.remoteStore=this.createRemoteStore(t),this.eventManager=this.createEventManager(t),this.syncEngine=this.createSyncEngine(t,!e.synchronizeTabs),this.sharedClientState.onlineStateHandler=e=>__PRIVATE_syncEngineApplyOnlineStateChange(this.syncEngine,e,1),this.remoteStore.remoteSyncer.handleCredentialChange=__PRIVATE_syncEngineHandleCredentialChange.bind(null,this.syncEngine),await __PRIVATE_remoteStoreApplyPrimaryState(this.remoteStore,this.syncEngine.isPrimaryClient))}createEventManager(e){return new __PRIVATE_EventManagerImpl}createDatastore(e){var t,r,n;let i=__PRIVATE_newSerializer(e.databaseInfo.databaseId),s=(t=e.databaseInfo,new __PRIVATE_WebChannelConnection(t));return r=e.authCredentials,n=e.appCheckCredentials,new __PRIVATE_DatastoreImpl(r,n,s,i)}createRemoteStore(e){var t,r,n,i;return t=this.localStore,r=this.datastore,n=e.asyncQueue,i=__PRIVATE_BrowserConnectivityMonitor.D()?new __PRIVATE_BrowserConnectivityMonitor:new __PRIVATE_NoopConnectivityMonitor,new __PRIVATE_RemoteStoreImpl(t,r,n,e=>__PRIVATE_syncEngineApplyOnlineStateChange(this.syncEngine,e,0),i)}createSyncEngine(e,t){return function(e,t,r,n,i,s,a){let o=new __PRIVATE_SyncEngineImpl(e,t,r,n,i,s);return a&&(o.Qa=!0),o}(this.localStore,this.remoteStore,this.eventManager,this.sharedClientState,e.initialUser,e.maxConcurrentLimboResolutions,t)}async terminate(){var e,t;await async function(e){__PRIVATE_logDebug("RemoteStore","RemoteStore shutting down."),e.L_.add(5),await __PRIVATE_disableNetworkInternal(e),e.k_.shutdown(),e.q_.set("Unknown")}(this.remoteStore),null===(e=this.datastore)||void 0===e||e.terminate(),null===(t=this.eventManager)||void 0===t||t.terminate()}};OnlineComponentProvider.provider={build:()=>new OnlineComponentProvider};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_AsyncObserver=class __PRIVATE_AsyncObserver{constructor(e){this.observer=e,this.muted=!1}next(e){this.muted||this.observer.next&&this.Ya(this.observer.next,e)}error(e){this.muted||(this.observer.error?this.Ya(this.observer.error,e):__PRIVATE_logError("Uncaught Error in snapshot listener:",e.toString()))}Za(){this.muted=!0}Ya(e,t){setTimeout(()=>{this.muted||e(t)},0)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let FirestoreClient=class FirestoreClient{constructor(e,t,r,n,i){this.authCredentials=e,this.appCheckCredentials=t,this.asyncQueue=r,this.databaseInfo=n,this.user=User.UNAUTHENTICATED,this.clientId=__PRIVATE_AutoId.newId(),this.authCredentialListener=()=>Promise.resolve(),this.appCheckCredentialListener=()=>Promise.resolve(),this._uninitializedComponentsProvider=i,this.authCredentials.start(r,async e=>{__PRIVATE_logDebug("FirestoreClient","Received user=",e.uid),await this.authCredentialListener(e),this.user=e}),this.appCheckCredentials.start(r,e=>(__PRIVATE_logDebug("FirestoreClient","Received new app check token=",e),this.appCheckCredentialListener(e,this.user)))}get configuration(){return{asyncQueue:this.asyncQueue,databaseInfo:this.databaseInfo,clientId:this.clientId,authCredentials:this.authCredentials,appCheckCredentials:this.appCheckCredentials,initialUser:this.user,maxConcurrentLimboResolutions:100}}setCredentialChangeListener(e){this.authCredentialListener=e}setAppCheckTokenChangeListener(e){this.appCheckCredentialListener=e}terminate(){this.asyncQueue.enterRestrictedMode();let e=new __PRIVATE_Deferred;return this.asyncQueue.enqueueAndForgetEvenWhileRestricted(async()=>{try{this._onlineComponents&&await this._onlineComponents.terminate(),this._offlineComponents&&await this._offlineComponents.terminate(),this.authCredentials.shutdown(),this.appCheckCredentials.shutdown(),e.resolve()}catch(r){let t=__PRIVATE_wrapInUserErrorIfRecoverable(r,"Failed to shutdown persistence");e.reject(t)}}),e.promise}};async function __PRIVATE_setOfflineComponentProvider(e,t){e.asyncQueue.verifyOperationInProgress(),__PRIVATE_logDebug("FirestoreClient","Initializing OfflineComponentProvider");let r=e.configuration;await t.initialize(r);let n=r.initialUser;e.setCredentialChangeListener(async e=>{n.isEqual(e)||(await __PRIVATE_localStoreHandleUserChange(t.localStore,e),n=e)}),t.persistence.setDatabaseDeletedListener(()=>e.terminate()),e._offlineComponents=t}async function __PRIVATE_setOnlineComponentProvider(e,t){e.asyncQueue.verifyOperationInProgress();let r=await __PRIVATE_ensureOfflineComponents(e);__PRIVATE_logDebug("FirestoreClient","Initializing OnlineComponentProvider"),await t.initialize(r,e.configuration),e.setCredentialChangeListener(e=>__PRIVATE_remoteStoreHandleCredentialChange(t.remoteStore,e)),e.setAppCheckTokenChangeListener((e,r)=>__PRIVATE_remoteStoreHandleCredentialChange(t.remoteStore,r)),e._onlineComponents=t}async function __PRIVATE_ensureOfflineComponents(e){if(!e._offlineComponents){if(e._uninitializedComponentsProvider){__PRIVATE_logDebug("FirestoreClient","Using user provided OfflineComponentProvider");try{await __PRIVATE_setOfflineComponentProvider(e,e._uninitializedComponentsProvider._offline)}catch(t){if(!("FirebaseError"===t.name?t.code===p.FAILED_PRECONDITION||t.code===p.UNIMPLEMENTED:!("undefined"!=typeof DOMException&&t instanceof DOMException)||22===t.code||20===t.code||11===t.code))throw t;__PRIVATE_logWarn("Error using user provided cache. Falling back to memory cache: "+t),await __PRIVATE_setOfflineComponentProvider(e,new __PRIVATE_MemoryOfflineComponentProvider)}}else __PRIVATE_logDebug("FirestoreClient","Using default OfflineComponentProvider"),await __PRIVATE_setOfflineComponentProvider(e,new __PRIVATE_MemoryOfflineComponentProvider)}return e._offlineComponents}async function __PRIVATE_ensureOnlineComponents(e){return e._onlineComponents||(e._uninitializedComponentsProvider?(__PRIVATE_logDebug("FirestoreClient","Using user provided OnlineComponentProvider"),await __PRIVATE_setOnlineComponentProvider(e,e._uninitializedComponentsProvider._online)):(__PRIVATE_logDebug("FirestoreClient","Using default OnlineComponentProvider"),await __PRIVATE_setOnlineComponentProvider(e,new OnlineComponentProvider))),e._onlineComponents}async function __PRIVATE_getEventManager(e){let t=await __PRIVATE_ensureOnlineComponents(e),r=t.eventManager;return r.onListen=__PRIVATE_syncEngineListen.bind(null,t.syncEngine),r.onUnlisten=__PRIVATE_syncEngineUnlisten.bind(null,t.syncEngine),r.onFirstRemoteStoreListen=__PRIVATE_triggerRemoteStoreListen.bind(null,t.syncEngine),r.onLastRemoteStoreUnlisten=__PRIVATE_triggerRemoteStoreUnlisten.bind(null,t.syncEngine),r}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function __PRIVATE_cloneLongPollingOptions(e){let t={};return void 0!==e.timeoutSeconds&&(t.timeoutSeconds=e.timeoutSeconds),t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let k=new Map;function __PRIVATE_validateDocumentPath(e){if(!DocumentKey.isDocumentKey(e))throw new FirestoreError(p.INVALID_ARGUMENT,`Invalid document reference. Document references must have an even number of segments, but ${e} has ${e.length}.`)}function __PRIVATE_valueDescription(e){if(void 0===e)return"undefined";if(null===e)return"null";if("string"==typeof e)return e.length>20&&(e=`${e.substring(0,20)}...`),JSON.stringify(e);if("number"==typeof e||"boolean"==typeof e)return""+e;if("object"==typeof e){if(e instanceof Array)return"an array";{var t;let r=(t=e).constructor?t.constructor.name:null;return r?`a custom ${r} object`:"an object"}}return"function"==typeof e?"a function":fail()}function __PRIVATE_cast(e,t){if("_delegate"in e&&(e=e._delegate),!(e instanceof t)){if(t.name===e.constructor.name)throw new FirestoreError(p.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{let r=__PRIVATE_valueDescription(e);throw new FirestoreError(p.INVALID_ARGUMENT,`Expected type '${t.name}', but it was: ${r}`)}}return e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let FirestoreSettingsImpl=class FirestoreSettingsImpl{constructor(e){var t,r;if(void 0===e.host){if(void 0!==e.ssl)throw new FirestoreError(p.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host="firestore.googleapis.com",this.ssl=!0}else this.host=e.host,this.ssl=null===(t=e.ssl)||void 0===t||t;if(this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,void 0===e.cacheSizeBytes)this.cacheSizeBytes=41943040;else{if(-1!==e.cacheSizeBytes&&e.cacheSizeBytes<1048576)throw new FirestoreError(p.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}(function(e,t,r,n){if(!0===t&&!0===n)throw new FirestoreError(p.INVALID_ARGUMENT,`${e} and ${r} cannot be used together.`)})("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:void 0===e.experimentalAutoDetectLongPolling?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=__PRIVATE_cloneLongPollingOptions(null!==(r=e.experimentalLongPollingOptions)&&void 0!==r?r:{}),function(e){if(void 0!==e.timeoutSeconds){if(isNaN(e.timeoutSeconds))throw new FirestoreError(p.INVALID_ARGUMENT,`invalid long polling timeout: ${e.timeoutSeconds} (must not be NaN)`);if(e.timeoutSeconds<5)throw new FirestoreError(p.INVALID_ARGUMENT,`invalid long polling timeout: ${e.timeoutSeconds} (minimum allowed value is 5)`);if(e.timeoutSeconds>30)throw new FirestoreError(p.INVALID_ARGUMENT,`invalid long polling timeout: ${e.timeoutSeconds} (maximum allowed value is 30)`)}}(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams}isEqual(e){var t,r;return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&(t=this.experimentalLongPollingOptions,r=e.experimentalLongPollingOptions,t.timeoutSeconds===r.timeoutSeconds)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams}};let Firestore$1=class Firestore$1{constructor(e,t,r,n){this._authCredentials=e,this._appCheckCredentials=t,this._databaseId=r,this._app=n,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new FirestoreSettingsImpl({}),this._settingsFrozen=!1,this._terminateTask="notTerminated"}get app(){if(!this._app)throw new FirestoreError(p.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return"notTerminated"!==this._terminateTask}_setSettings(e){if(this._settingsFrozen)throw new FirestoreError(p.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new FirestoreSettingsImpl(e),void 0!==e.credentials&&(this._authCredentials=function(e){if(!e)return new __PRIVATE_EmptyAuthCredentialsProvider;switch(e.type){case"firstParty":return new __PRIVATE_FirstPartyAuthCredentialsProvider(e.sessionIndex||"0",e.iamToken||null,e.authTokenFactory||null);case"provider":return e.client;default:throw new FirestoreError(p.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}}(e.credentials))}_getSettings(){return this._settings}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return"notTerminated"===this._terminateTask&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){"notTerminated"===this._terminateTask?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return function(e){let t=k.get(e);t&&(__PRIVATE_logDebug("ComponentProvider","Removing Datastore"),k.delete(e),t.terminate())}(this),Promise.resolve()}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Query=class Query{constructor(e,t,r){this.converter=t,this._query=r,this.type="query",this.firestore=e}withConverter(e){return new Query(this.firestore,e,this._query)}};let DocumentReference=class DocumentReference{constructor(e,t,r){this.converter=t,this._key=r,this.type="document",this.firestore=e}get _path(){return this._key.path}get id(){return this._key.path.lastSegment()}get path(){return this._key.path.canonicalString()}get parent(){return new CollectionReference(this.firestore,this.converter,this._key.path.popLast())}withConverter(e){return new DocumentReference(this.firestore,e,this._key)}};let CollectionReference=class CollectionReference extends Query{constructor(e,t,r){super(e,t,new __PRIVATE_QueryImpl(r)),this._path=r,this.type="collection"}get id(){return this._query.path.lastSegment()}get path(){return this._query.path.canonicalString()}get parent(){let e=this._path.popLast();return e.isEmpty()?null:new DocumentReference(this.firestore,null,new DocumentKey(e))}withConverter(e){return new CollectionReference(this.firestore,e,this._path)}};function doc(e,t,...r){if(e=(0,c.m9)(e),1==arguments.length&&(t=__PRIVATE_AutoId.newId()),/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function(e,t,r){if(!r)throw new FirestoreError(p.INVALID_ARGUMENT,`Function doc() cannot be called with an empty ${t}.`)}(0,"path",t),e instanceof Firestore$1){let n=ResourcePath.fromString(t,...r);return __PRIVATE_validateDocumentPath(n),new DocumentReference(e,null,new DocumentKey(n))}{if(!(e instanceof DocumentReference||e instanceof CollectionReference))throw new FirestoreError(p.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");let n=e._path.child(ResourcePath.fromString(t,...r));return __PRIVATE_validateDocumentPath(n),new DocumentReference(e.firestore,e instanceof CollectionReference?e.converter:null,new DocumentKey(n))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let __PRIVATE_AsyncQueueImpl=class __PRIVATE_AsyncQueueImpl{constructor(e=Promise.resolve()){this.Pu=[],this.Iu=!1,this.Tu=[],this.Eu=null,this.du=!1,this.Au=!1,this.Ru=[],this.t_=new __PRIVATE_ExponentialBackoff(this,"async_queue_retry"),this.Vu=()=>{let e=getDocument();e&&__PRIVATE_logDebug("AsyncQueue","Visibility state changed to "+e.visibilityState),this.t_.jo()},this.mu=e;let t=getDocument();t&&"function"==typeof t.addEventListener&&t.addEventListener("visibilitychange",this.Vu)}get isShuttingDown(){return this.Iu}enqueueAndForget(e){this.enqueue(e)}enqueueAndForgetEvenWhileRestricted(e){this.fu(),this.gu(e)}enterRestrictedMode(e){if(!this.Iu){this.Iu=!0,this.Au=e||!1;let t=getDocument();t&&"function"==typeof t.removeEventListener&&t.removeEventListener("visibilitychange",this.Vu)}}enqueue(e){if(this.fu(),this.Iu)return new Promise(()=>{});let t=new __PRIVATE_Deferred;return this.gu(()=>this.Iu&&this.Au?Promise.resolve():(e().then(t.resolve,t.reject),t.promise)).then(()=>t.promise)}enqueueRetryable(e){this.enqueueAndForget(()=>(this.Pu.push(e),this.pu()))}async pu(){if(0!==this.Pu.length){try{await this.Pu[0](),this.Pu.shift(),this.t_.reset()}catch(e){if(!__PRIVATE_isIndexedDbTransactionError(e))throw e;__PRIVATE_logDebug("AsyncQueue","Operation failed with retryable error: "+e)}this.Pu.length>0&&this.t_.Go(()=>this.pu())}}gu(e){let t=this.mu.then(()=>(this.du=!0,e().catch(e=>{let t;this.Eu=e,this.du=!1;let r=(t=e.message||"",e.stack&&(t=e.stack.includes(e.message)?e.stack:e.message+"\n"+e.stack),t);throw __PRIVATE_logError("INTERNAL UNHANDLED ERROR: ",r),e}).then(e=>(this.du=!1,e))));return this.mu=t,t}enqueueAfterDelay(e,t,r){this.fu(),this.Ru.indexOf(e)>-1&&(t=0);let n=DelayedOperation.createAndSchedule(this,e,t,r,e=>this.yu(e));return this.Tu.push(n),n}fu(){this.Eu&&fail()}verifyOperationInProgress(){}async wu(){let e;do e=this.mu,await e;while(e!==this.mu)}Su(e){for(let t of this.Tu)if(t.timerId===e)return!0;return!1}bu(e){return this.wu().then(()=>{for(let t of(this.Tu.sort((e,t)=>e.targetTimeMs-t.targetTimeMs),this.Tu))if(t.skipDelay(),"all"!==e&&t.timerId===e)break;return this.wu()})}Du(e){this.Ru.push(e)}yu(e){let t=this.Tu.indexOf(e);this.Tu.splice(t,1)}};let Firestore=class Firestore extends Firestore$1{constructor(e,t,r,n){super(e,t,r,n),this.type="firestore",this._queue=new __PRIVATE_AsyncQueueImpl,this._persistenceKey=(null==n?void 0:n.name)||"[DEFAULT]"}async _terminate(){if(this._firestoreClient){let e=this._firestoreClient.terminate();this._queue=new __PRIVATE_AsyncQueueImpl(e),this._firestoreClient=void 0,await e}}};function getFirestore(e,t){let r="object"==typeof e?e:(0,o.Mq)(),n=(0,o.qX)(r,"firestore").getImmediate({identifier:"string"==typeof e?e:t||"(default)"});if(!n._initialized){let e=(0,c.P0)("firestore");e&&function(e,t,r,n={}){var i;let s=(e=__PRIVATE_cast(e,Firestore$1))._getSettings(),a=`${t}:${r}`;if("firestore.googleapis.com"!==s.host&&s.host!==a&&__PRIVATE_logWarn("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used."),e._setSettings(Object.assign(Object.assign({},s),{host:a,ssl:!1})),n.mockUserToken){let t,r;if("string"==typeof n.mockUserToken)t=n.mockUserToken,r=User.MOCK_USER;else{t=(0,c.Sg)(n.mockUserToken,null===(i=e._app)||void 0===i?void 0:i.options.projectId);let s=n.mockUserToken.sub||n.mockUserToken.user_id;if(!s)throw new FirestoreError(p.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");r=new User(s)}e._authCredentials=new __PRIVATE_EmulatorAuthCredentialsProvider(new __PRIVATE_OAuthToken(t,r))}}(n,...e)}return n}function ensureFirestoreConfigured(e){if(e._terminated)throw new FirestoreError(p.FAILED_PRECONDITION,"The client has already been terminated.");return e._firestoreClient||function(e){var t,r,n,i,s,a;let o=e._freezeSettings(),l=(i=e._databaseId,s=(null===(t=e._app)||void 0===t?void 0:t.options.appId)||"",a=e._persistenceKey,new DatabaseInfo(i,s,a,o.host,o.ssl,o.experimentalForceLongPolling,o.experimentalAutoDetectLongPolling,__PRIVATE_cloneLongPollingOptions(o.experimentalLongPollingOptions),o.useFetchStreams));e._componentsProvider||(null===(r=o.localCache)||void 0===r?void 0:r._offlineComponentProvider)&&(null===(n=o.localCache)||void 0===n?void 0:n._onlineComponentProvider)&&(e._componentsProvider={_offline:o.localCache._offlineComponentProvider,_online:o.localCache._onlineComponentProvider}),e._firestoreClient=new FirestoreClient(e._authCredentials,e._appCheckCredentials,e._queue,l,e._componentsProvider&&function(e){let t=null==e?void 0:e._online.build();return{_offline:null==e?void 0:e._offline.build(t),_online:t}}(e._componentsProvider))}(e),e._firestoreClient}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Bytes=class Bytes{constructor(e){this._byteString=e}static fromBase64String(e){try{return new Bytes(ByteString.fromBase64String(e))}catch(e){throw new FirestoreError(p.INVALID_ARGUMENT,"Failed to construct data from Base64 string: "+e)}}static fromUint8Array(e){return new Bytes(ByteString.fromUint8Array(e))}toBase64(){return this._byteString.toBase64()}toUint8Array(){return this._byteString.toUint8Array()}toString(){return"Bytes(base64: "+this.toBase64()+")"}isEqual(e){return this._byteString.isEqual(e._byteString)}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let FieldPath=class FieldPath{constructor(...e){for(let t=0;t<e.length;++t)if(0===e[t].length)throw new FirestoreError(p.INVALID_ARGUMENT,"Invalid field name at argument $(i + 1). Field names must not be empty.");this._internalPath=new FieldPath$1(e)}isEqual(e){return this._internalPath.isEqual(e._internalPath)}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let FieldValue=class FieldValue{constructor(e){this._methodName=e}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let GeoPoint=class GeoPoint{constructor(e,t){if(!isFinite(e)||e<-90||e>90)throw new FirestoreError(p.INVALID_ARGUMENT,"Latitude must be a number between -90 and 90, but was: "+e);if(!isFinite(t)||t<-180||t>180)throw new FirestoreError(p.INVALID_ARGUMENT,"Longitude must be a number between -180 and 180, but was: "+t);this._lat=e,this._long=t}get latitude(){return this._lat}get longitude(){return this._long}isEqual(e){return this._lat===e._lat&&this._long===e._long}toJSON(){return{latitude:this._lat,longitude:this._long}}_compareTo(e){return __PRIVATE_primitiveComparator(this._lat,e._lat)||__PRIVATE_primitiveComparator(this._long,e._long)}};/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let VectorValue=class VectorValue{constructor(e){this._values=(e||[]).map(e=>e)}toArray(){return this._values.map(e=>e)}isEqual(e){return function(e,t){if(e.length!==t.length)return!1;for(let r=0;r<e.length;++r)if(e[r]!==t[r])return!1;return!0}(this._values,e._values)}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let F=/^__.*__$/;let ParsedSetData=class ParsedSetData{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return null!==this.fieldMask?new __PRIVATE_PatchMutation(e,this.data,this.fieldMask,t,this.fieldTransforms):new __PRIVATE_SetMutation(e,this.data,t,this.fieldTransforms)}};function __PRIVATE_isWrite(e){switch(e){case 0:case 2:case 1:return!0;case 3:case 4:return!1;default:throw fail()}}let __PRIVATE_ParseContextImpl=class __PRIVATE_ParseContextImpl{constructor(e,t,r,n,i,s){this.settings=e,this.databaseId=t,this.serializer=r,this.ignoreUndefinedProperties=n,void 0===i&&this.vu(),this.fieldTransforms=i||[],this.fieldMask=s||[]}get path(){return this.settings.path}get Cu(){return this.settings.Cu}Fu(e){return new __PRIVATE_ParseContextImpl(Object.assign(Object.assign({},this.settings),e),this.databaseId,this.serializer,this.ignoreUndefinedProperties,this.fieldTransforms,this.fieldMask)}Mu(e){var t;let r=null===(t=this.path)||void 0===t?void 0:t.child(e),n=this.Fu({path:r,xu:!1});return n.Ou(e),n}Nu(e){var t;let r=null===(t=this.path)||void 0===t?void 0:t.child(e),n=this.Fu({path:r,xu:!1});return n.vu(),n}Lu(e){return this.Fu({path:void 0,xu:!0})}Bu(e){return __PRIVATE_createError(e,this.settings.methodName,this.settings.ku||!1,this.path,this.settings.qu)}contains(e){return void 0!==this.fieldMask.find(t=>e.isPrefixOf(t))||void 0!==this.fieldTransforms.find(t=>e.isPrefixOf(t.field))}vu(){if(this.path)for(let e=0;e<this.path.length;e++)this.Ou(this.path.get(e))}Ou(e){if(0===e.length)throw this.Bu("Document fields must not be empty");if(__PRIVATE_isWrite(this.Cu)&&F.test(e))throw this.Bu('Document fields cannot begin and end with "__"')}};let __PRIVATE_UserDataReader=class __PRIVATE_UserDataReader{constructor(e,t,r){this.databaseId=e,this.ignoreUndefinedProperties=t,this.serializer=r||__PRIVATE_newSerializer(e)}Qu(e,t,r,n=!1){return new __PRIVATE_ParseContextImpl({Cu:e,methodName:t,qu:r,path:FieldPath$1.emptyPath(),xu:!1,ku:n},this.databaseId,this.serializer,this.ignoreUndefinedProperties)}};function __PRIVATE_looksLikeJsonObject(e){return!("object"!=typeof e||null===e||e instanceof Array||e instanceof Date||e instanceof Timestamp||e instanceof GeoPoint||e instanceof Bytes||e instanceof DocumentReference||e instanceof FieldValue||e instanceof VectorValue)}function __PRIVATE_validatePlainObject(e,t,r){if(!__PRIVATE_looksLikeJsonObject(r)||!("object"==typeof r&&null!==r&&(Object.getPrototypeOf(r)===Object.prototype||null===Object.getPrototypeOf(r)))){let n=__PRIVATE_valueDescription(r);throw"an object"===n?t.Bu(e+" a custom object"):t.Bu(e+" "+n)}}let L=RegExp("[~\\*/\\[\\]]");function __PRIVATE_fieldPathFromDotSeparatedString(e,t,r){if(t.search(L)>=0)throw __PRIVATE_createError(`Invalid field path (${t}). Paths must not contain '~', '*', '/', '[', or ']'`,e,!1,void 0,r);try{return new FieldPath(...t.split("."))._internalPath}catch(n){throw __PRIVATE_createError(`Invalid field path (${t}). Paths must not be empty, begin with '.', end with '.', or contain '..'`,e,!1,void 0,r)}}function __PRIVATE_createError(e,t,r,n,i){let s=n&&!n.isEmpty(),a=void 0!==i,o=`Function ${t}() called with invalid data`;r&&(o+=" (via `toFirestore()`)"),o+=". ";let l="";return(s||a)&&(l+=" (found",s&&(l+=` in field ${n}`),a&&(l+=` in document ${i}`),l+=")"),new FirestoreError(p.INVALID_ARGUMENT,o+e+l)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let DocumentSnapshot$1=class DocumentSnapshot$1{constructor(e,t,r,n,i){this._firestore=e,this._userDataWriter=t,this._key=r,this._document=n,this._converter=i}get id(){return this._key.path.lastSegment()}get ref(){return new DocumentReference(this._firestore,this._converter,this._key)}exists(){return null!==this._document}data(){if(this._document){if(this._converter){let e=new QueryDocumentSnapshot$1(this._firestore,this._userDataWriter,this._key,this._document,null);return this._converter.fromFirestore(e)}return this._userDataWriter.convertValue(this._document.data.value)}}get(e){if(this._document){let t=this._document.data.field(__PRIVATE_fieldPathFromArgument("DocumentSnapshot.get",e));if(null!==t)return this._userDataWriter.convertValue(t)}}};let QueryDocumentSnapshot$1=class QueryDocumentSnapshot$1 extends DocumentSnapshot$1{data(){return super.data()}};function __PRIVATE_fieldPathFromArgument(e,t){return"string"==typeof t?__PRIVATE_fieldPathFromDotSeparatedString(e,t):t instanceof FieldPath?t._internalPath:t._delegate._internalPath}let AbstractUserDataWriter=class AbstractUserDataWriter{convertValue(e,t="none"){switch(__PRIVATE_typeOrder(e)){case 0:return null;case 1:return e.booleanValue;case 2:return __PRIVATE_normalizeNumber(e.integerValue||e.doubleValue);case 3:return this.convertTimestamp(e.timestampValue);case 4:return this.convertServerTimestamp(e,t);case 5:return e.stringValue;case 6:return this.convertBytes(__PRIVATE_normalizeByteString(e.bytesValue));case 7:return this.convertReference(e.referenceValue);case 8:return this.convertGeoPoint(e.geoPointValue);case 9:return this.convertArray(e.arrayValue,t);case 11:return this.convertObject(e.mapValue,t);case 10:return this.convertVectorValue(e.mapValue);default:throw fail()}}convertObject(e,t){return this.convertObjectMap(e.fields,t)}convertObjectMap(e,t="none"){let r={};return forEach(e,(e,n)=>{r[e]=this.convertValue(n,t)}),r}convertVectorValue(e){var t,r,n;let i=null===(n=null===(r=null===(t=e.fields)||void 0===t?void 0:t.value.arrayValue)||void 0===r?void 0:r.values)||void 0===n?void 0:n.map(e=>__PRIVATE_normalizeNumber(e.doubleValue));return new VectorValue(i)}convertGeoPoint(e){return new GeoPoint(__PRIVATE_normalizeNumber(e.latitude),__PRIVATE_normalizeNumber(e.longitude))}convertArray(e,t){return(e.values||[]).map(e=>this.convertValue(e,t))}convertServerTimestamp(e,t){switch(t){case"previous":let r=__PRIVATE_getPreviousValue(e);return null==r?null:this.convertValue(r,t);case"estimate":return this.convertTimestamp(__PRIVATE_getLocalWriteTime(e));default:return null}}convertTimestamp(e){let t=__PRIVATE_normalizeTimestamp(e);return new Timestamp(t.seconds,t.nanos)}convertDocumentKey(e,t){let r=ResourcePath.fromString(e);__PRIVATE_isValidResourceName(r)||fail();let n=new DatabaseId(r.get(1),r.get(3)),i=new DocumentKey(r.popFirst(5));return n.isEqual(t)||__PRIVATE_logError(`Document ${i} contains a document reference within a different database (${n.projectId}/${n.database}) which is not supported. It will be treated as a reference in the current database (${t.projectId}/${t.database}) instead.`),i}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let SnapshotMetadata=class SnapshotMetadata{constructor(e,t){this.hasPendingWrites=e,this.fromCache=t}isEqual(e){return this.hasPendingWrites===e.hasPendingWrites&&this.fromCache===e.fromCache}};let DocumentSnapshot=class DocumentSnapshot extends DocumentSnapshot$1{constructor(e,t,r,n,i,s){super(e,t,r,n,s),this._firestore=e,this._firestoreImpl=e,this.metadata=i}exists(){return super.exists()}data(e={}){if(this._document){if(this._converter){let t=new QueryDocumentSnapshot(this._firestore,this._userDataWriter,this._key,this._document,this.metadata,null);return this._converter.fromFirestore(t,e)}return this._userDataWriter.convertValue(this._document.data.value,e.serverTimestamps)}}get(e,t={}){if(this._document){let r=this._document.data.field(__PRIVATE_fieldPathFromArgument("DocumentSnapshot.get",e));if(null!==r)return this._userDataWriter.convertValue(r,t.serverTimestamps)}}};let QueryDocumentSnapshot=class QueryDocumentSnapshot extends DocumentSnapshot{data(e={}){return super.data(e)}};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function getDoc(e){e=__PRIVATE_cast(e,DocumentReference);let t=__PRIVATE_cast(e.firestore,Firestore);return(function(e,t,r={}){let n=new __PRIVATE_Deferred;return e.asyncQueue.enqueueAndForget(async()=>(function(e,t,r,n,i){var s;let a=new __PRIVATE_AsyncObserver({next:s=>{a.Za(),t.enqueueAndForget(()=>__PRIVATE_eventManagerUnlisten(e,o));let l=s.docs.has(r);!l&&s.fromCache?i.reject(new FirestoreError(p.UNAVAILABLE,"Failed to get document because the client is offline.")):l&&s.fromCache&&n&&"server"===n.source?i.reject(new FirestoreError(p.UNAVAILABLE,'Failed to get document from server. (However, this document does exist in the local cache. Run again without setting source to "server" to retrieve the cached document.)')):i.resolve(s)},error:e=>i.reject(e)}),o=new __PRIVATE_QueryListener((s=r.path,new __PRIVATE_QueryImpl(s)),a,{includeMetadataChanges:!0,_a:!0});return __PRIVATE_eventManagerListen(e,o)})(await __PRIVATE_getEventManager(e),e.asyncQueue,t,r,n)),n.promise})(ensureFirestoreConfigured(t),e._key).then(r=>(function(e,t,r){let n=r.docs.get(t._key),i=new __PRIVATE_ExpUserDataWriter(e);return new DocumentSnapshot(e,i,t._key,n,new SnapshotMetadata(r.hasPendingWrites,r.fromCache),t.converter)})(t,e,r))}let __PRIVATE_ExpUserDataWriter=class __PRIVATE_ExpUserDataWriter extends AbstractUserDataWriter{constructor(e){super(),this.firestore=e}convertBytes(e){return new Bytes(e)}convertReference(e){let t=this.convertDocumentKey(e,this.firestore._databaseId);return new DocumentReference(this.firestore,null,t)}};function setDoc(e,t,r){var n,i;e=__PRIVATE_cast(e,DocumentReference);let s=__PRIVATE_cast(e.firestore,Firestore),a=(n=e.converter)?r&&(r.merge||r.mergeFields)?n.toFirestore(t,r):n.toFirestore(t):t;return i=[(function(e,t,r,n,i,s={}){let a,o;let l=e.Qu(s.merge||s.mergeFields?2:0,t,r,i);__PRIVATE_validatePlainObject("Data must be an object, but it was:",l,n);let u=function __PRIVATE_parseObject(e,t){let r={};return isEmpty(e)?t.path&&t.path.length>0&&t.fieldMask.push(t.path):forEach(e,(e,n)=>{let i=function __PRIVATE_parseData(e,t){if(__PRIVATE_looksLikeJsonObject(e=(0,c.m9)(e)))return __PRIVATE_validatePlainObject("Unsupported field value:",t,e),__PRIVATE_parseObject(e,t);if(e instanceof FieldValue)return function(e,t){if(!__PRIVATE_isWrite(t.Cu))throw t.Bu(`${e._methodName}() can only be used with update() and set()`);if(!t.path)throw t.Bu(`${e._methodName}() is not currently supported inside arrays`);let r=e._toFieldTransform(t);r&&t.fieldTransforms.push(r)}(e,t),null;if(void 0===e&&t.ignoreUndefinedProperties)return null;if(t.path&&t.fieldMask.push(t.path),e instanceof Array){if(t.settings.xu&&4!==t.Cu)throw t.Bu("Nested arrays are not supported");return function(e,t){let r=[],n=0;for(let i of e){let e=__PRIVATE_parseData(i,t.Lu(n));null==e&&(e={nullValue:"NULL_VALUE"}),r.push(e),n++}return{arrayValue:{values:r}}}(e,t)}return function(e,t){var r,n,i;if(null===(e=(0,c.m9)(e)))return{nullValue:"NULL_VALUE"};if("number"==typeof e)return r=t.serializer,"number"==typeof(i=n=e)&&Number.isInteger(i)&&!__PRIVATE_isNegativeZero(i)&&i<=Number.MAX_SAFE_INTEGER&&i>=Number.MIN_SAFE_INTEGER?__PRIVATE_toInteger(n):__PRIVATE_toDouble(r,n);if("boolean"==typeof e)return{booleanValue:e};if("string"==typeof e)return{stringValue:e};if(e instanceof Date){let r=Timestamp.fromDate(e);return{timestampValue:toTimestamp(t.serializer,r)}}if(e instanceof Timestamp){let r=new Timestamp(e.seconds,1e3*Math.floor(e.nanoseconds/1e3));return{timestampValue:toTimestamp(t.serializer,r)}}if(e instanceof GeoPoint)return{geoPointValue:{latitude:e.latitude,longitude:e.longitude}};if(e instanceof Bytes)return{bytesValue:__PRIVATE_toBytes(t.serializer,e._byteString)};if(e instanceof DocumentReference){let r=t.databaseId,n=e.firestore._databaseId;if(!n.isEqual(r))throw t.Bu(`Document reference is for database ${n.projectId}/${n.database} but should be for database ${r.projectId}/${r.database}`);return{referenceValue:__PRIVATE_toResourceName(e.firestore._databaseId||t.databaseId,e._key.path)}}if(e instanceof VectorValue)return{mapValue:{fields:{__type__:{stringValue:"__vector__"},value:{arrayValue:{values:e.toArray().map(e=>{if("number"!=typeof e)throw t.Bu("VectorValues must only contain numeric values.");return __PRIVATE_toDouble(t.serializer,e)})}}}}};throw t.Bu(`Unsupported field value: ${__PRIVATE_valueDescription(e)}`)}(e,t)}(n,t.Mu(e));null!=i&&(r[e]=i)}),{mapValue:{fields:r}}}(n,l);if(s.merge)a=new FieldMask(l.fieldMask),o=l.fieldTransforms;else if(s.mergeFields){let e=[];for(let n of s.mergeFields){let i=function(e,t,r){if((t=(0,c.m9)(t))instanceof FieldPath)return t._internalPath;if("string"==typeof t)return __PRIVATE_fieldPathFromDotSeparatedString(e,t);throw __PRIVATE_createError("Field path arguments must be of type string or ",e,!1,void 0,r)}(t,n,r);if(!l.contains(i))throw new FirestoreError(p.INVALID_ARGUMENT,`Field '${i}' is specified in your field mask but missing from your input data.`);(function(e,t){return e.some(e=>e.isEqual(t))})(e,i)||e.push(i)}a=new FieldMask(e),o=l.fieldTransforms.filter(e=>a.covers(e.field))}else a=null,o=l.fieldTransforms;return new ParsedSetData(new ObjectValue(u),a,o)})(function(e){let t=e._freezeSettings(),r=__PRIVATE_newSerializer(e._databaseId);return new __PRIVATE_UserDataReader(e._databaseId,!!t.ignoreUndefinedProperties,r)}(s),"setDoc",e._key,a,null!==e.converter,r).toMutation(e._key,Precondition.none())],function(e,t){let r=new __PRIVATE_Deferred;return e.asyncQueue.enqueueAndForget(async()=>__PRIVATE_syncEngineWrite(await __PRIVATE_ensureOnlineComponents(e).then(e=>e.syncEngine),t,r)),r.promise}(ensureFirestoreConfigured(s),i)}new WeakMap,function(e=!0){f=o.Jn,(0,o.Xd)(new l.wA("firestore",(t,{instanceIdentifier:r,options:n})=>{let i=t.getProvider("app").getImmediate(),s=new Firestore(new __PRIVATE_FirebaseAuthCredentialsProvider(t.getProvider("auth-internal")),new __PRIVATE_FirebaseAppCheckTokenProvider(t.getProvider("app-check-internal")),function(e,t){if(!Object.prototype.hasOwnProperty.apply(e.options,["projectId"]))throw new FirestoreError(p.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new DatabaseId(e.options.projectId,t)}(i,r),i);return n=Object.assign({useFetchStreams:e},n),s._setSettings(n),s},"PUBLIC").setMultipleInstances(!0)),(0,o.KN)(m,"4.7.3",void 0),(0,o.KN)(m,"4.7.3","esm2017")}()}}]);