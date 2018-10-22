(function(f) {
    if (typeof exports === "object" && typeof module !== "undefined") {
        module.exports = f()
    } else if (typeof define === "function" && define.amd) {
        define([], f)
    } else {
        var g;
        if (typeof window !== "undefined") {
            g = window
        } else if (typeof global !== "undefined") {
            g = global
        } else if (typeof self !== "undefined") {
            g = self
        } else {
            g = this
        }
        g.socketCluster = f()
    }
}
)(function() {
    var define, module, exports;
    return function e(t, n, r) {
        function s(o, u) {
            if (!n[o]) {
                if (!t[o]) {
                    var a = typeof require == "function" && require;
                    if (!u && a)
                        return a(o, !0);
                    if (i)
                        return i(o, !0);
                    var f = new Error("Cannot find module '" + o + "'");
                    throw f.code = "MODULE_NOT_FOUND",
                    f
                }
                var l = n[o] = {
                    exports: {}
                };
                t[o][0].call(l.exports, function(e) {
                    var n = t[o][1][e];
                    return s(n ? n : e)
                }, l, l.exports, e, t, n, r)
            }
            return n[o].exports
        }
        var i = typeof require == "function" && require;
        for (var o = 0; o < r.length; o++)
            s(r[o]);
        return s
    }({
        1: [function(require, module, exports) {
            var SCSocket = require("./lib/scsocket");
            var SCSocketCreator = require("./lib/scsocketcreator");
            module.exports.SCSocketCreator = SCSocketCreator;
            module.exports.SCSocket = SCSocket;
            module.exports.SCEmitter = require("sc-emitter").SCEmitter;
            module.exports.connect = function(options) {
                return SCSocketCreator.connect(options)
            }
            ;
            module.exports.destroy = function(options) {
                return SCSocketCreator.destroy(options)
            }
            ;
            module.exports.connections = SCSocketCreator.connections;
            module.exports.version = "5.3.1"
        }
        , {
            "./lib/scsocket": 4,
            "./lib/scsocketcreator": 5,
            "sc-emitter": 15
        }],
        2: [function(require, module, exports) {
            (function(global) {
                var AuthEngine = function() {
                    this._internalStorage = {}
                };
                AuthEngine.prototype._isLocalStorageEnabled = function() {
                    var err;
                    try {
                        global.localStorage;
                        global.localStorage.setItem("__scLocalStorageTest", 1);
                        global.localStorage.removeItem("__scLocalStorageTest")
                    } catch (e) {
                        err = e
                    }
                    return !err
                }
                ;
                AuthEngine.prototype.saveToken = function(name, token, options, callback) {
                    if (this._isLocalStorageEnabled() && global.localStorage) {
                        global.localStorage.setItem(name, token)
                    } else {
                        this._internalStorage[name] = token
                    }
                    callback && callback(null, token)
                }
                ;
                AuthEngine.prototype.removeToken = function(name, callback) {
                    var token;
                    this.loadToken(name, function(err, authToken) {
                        token = authToken
                    });
                    if (this._isLocalStorageEnabled() && global.localStorage) {
                        global.localStorage.removeItem(name)
                    }
                    delete this._internalStorage[name];
                    callback && callback(null, token)
                }
                ;
                AuthEngine.prototype.loadToken = function(name, callback) {
                    var token;
                    if (this._isLocalStorageEnabled() && global.localStorage) {
                        token = global.localStorage.getItem(name)
                    } else {
                        token = this._internalStorage[name] || null
                    }
                    callback(null, token)
                }
                ;
                module.exports.AuthEngine = AuthEngine
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {}],
        3: [function(require, module, exports) {
            var scErrors = require("sc-errors");
            var InvalidActionError = scErrors.InvalidActionError;
            var Response = function(socket, id) {
                this.socket = socket;
                this.id = id;
                this.sent = false
            };
            Response.prototype._respond = function(responseData) {
                if (this.sent) {
                    throw new InvalidActionError("Response " + this.id + " has already been sent")
                } else {
                    this.sent = true;
                    this.socket.send(this.socket.encode(responseData))
                }
            }
            ;
            Response.prototype.end = function(data) {
                if (this.id) {
                    var responseData = {
                        rid: this.id
                    };
                    if (data !== undefined) {
                        responseData.data = data
                    }
                    this._respond(responseData)
                }
            }
            ;
            Response.prototype.error = function(error, data) {
                if (this.id) {
                    var err = scErrors.dehydrateError(error);
                    var responseData = {
                        rid: this.id,
                        error: err
                    };
                    if (data !== undefined) {
                        responseData.data = data
                    }
                    this._respond(responseData)
                }
            }
            ;
            Response.prototype.callback = function(error, data) {
                if (error) {
                    this.error(error, data)
                } else {
                    this.end(data)
                }
            }
            ;
            module.exports.Response = Response
        }
        , {
            "sc-errors": 17
        }],
        4: [function(require, module, exports) {
            (function(global, Buffer) {
                var SCEmitter = require("sc-emitter").SCEmitter;
                var SCChannel = require("sc-channel").SCChannel;
                var Response = require("./response").Response;
                var AuthEngine = require("./auth").AuthEngine;
                var formatter = require("sc-formatter");
                var SCTransport = require("./sctransport").SCTransport;
                var querystring = require("querystring");
                var LinkedList = require("linked-list");
                var base64 = require("base-64");
                var cloneDeep = require("lodash.clonedeep");
                var scErrors = require("sc-errors");
                var InvalidArgumentsError = scErrors.InvalidArgumentsError;
                var InvalidMessageError = scErrors.InvalidMessageError;
                var SocketProtocolError = scErrors.SocketProtocolError;
                var TimeoutError = scErrors.TimeoutError;
                var isBrowser = typeof window != "undefined";
                var SCSocket = function(opts) {
                    var self = this;
                    SCEmitter.call(this);
                    this.id = null;
                    this.state = this.CLOSED;
                    this.authState = this.PENDING;
                    this.signedAuthToken = null;
                    this.authToken = null;
                    this.pendingReconnect = false;
                    this.pendingReconnectTimeout = null;
                    this.pendingConnectCallback = false;
                    this.connectTimeout = opts.connectTimeout;
                    this.ackTimeout = opts.ackTimeout;
                    this.channelPrefix = opts.channelPrefix || null;
                    this.disconnectOnUnload = opts.disconnectOnUnload == null ? true : opts.disconnectOnUnload;
                    this.pingTimeout = this.ackTimeout;
                    var maxTimeout = Math.pow(2, 31) - 1;
                    var verifyDuration = function(propertyName) {
                        if (self[propertyName] > maxTimeout) {
                            throw new InvalidArgumentsError("The " + propertyName + " value provided exceeded the maximum amount allowed")
                        }
                    };
                    verifyDuration("connectTimeout");
                    verifyDuration("ackTimeout");
                    verifyDuration("pingTimeout");
                    this._localEvents = {
                        connect: 1,
                        connectAbort: 1,
                        disconnect: 1,
                        message: 1,
                        error: 1,
                        raw: 1,
                        fail: 1,
                        kickOut: 1,
                        subscribe: 1,
                        unsubscribe: 1,
                        subscribeStateChange: 1,
                        authStateChange: 1,
                        authenticate: 1,
                        deauthenticate: 1,
                        removeAuthToken: 1,
                        subscribeRequest: 1
                    };
                    this.connectAttempts = 0;
                    this._emitBuffer = new LinkedList;
                    this._channels = {};
                    this.options = opts;
                    this._cid = 1;
                    this.options.callIdGenerator = function() {
                        return self._callIdGenerator()
                    }
                    ;
                    if (this.options.autoReconnect) {
                        if (this.options.autoReconnectOptions == null) {
                            this.options.autoReconnectOptions = {}
                        }
                        var reconnectOptions = this.options.autoReconnectOptions;
                        if (reconnectOptions.initialDelay == null) {
                            reconnectOptions.initialDelay = 1e4
                        }
                        if (reconnectOptions.randomness == null) {
                            reconnectOptions.randomness = 1e4
                        }
                        if (reconnectOptions.multiplier == null) {
                            reconnectOptions.multiplier = 1.5
                        }
                        if (reconnectOptions.maxDelay == null) {
                            reconnectOptions.maxDelay = 6e4
                        }
                    }
                    if (this.options.subscriptionRetryOptions == null) {
                        this.options.subscriptionRetryOptions = {}
                    }
                    if (this.options.authEngine) {
                        this.auth = this.options.authEngine
                    } else {
                        this.auth = new AuthEngine
                    }
                    if (this.options.codecEngine) {
                        this.codec = this.options.codecEngine
                    } else {
                        this.codec = formatter
                    }
                    this.options.path = this.options.path.replace(/\/$/, "") + "/";
                    this.options.query = opts.query || {};
                    if (typeof this.options.query == "string") {
                        this.options.query = querystring.parse(this.options.query)
                    }
                    if (this.options.autoConnect) {
                        this.connect()
                    }
                    this._channelEmitter = new SCEmitter;
                    if (isBrowser && this.disconnectOnUnload) {
                        var unloadHandler = function() {
                            self.disconnect()
                        };
                        if (global.attachEvent) {
                            global.attachEvent("onunload", unloadHandler)
                        } else if (global.addEventListener) {
                            global.addEventListener("beforeunload", unloadHandler, false)
                        }
                    }
                };
                SCSocket.prototype = Object.create(SCEmitter.prototype);
                SCSocket.CONNECTING = SCSocket.prototype.CONNECTING = SCTransport.prototype.CONNECTING;
                SCSocket.OPEN = SCSocket.prototype.OPEN = SCTransport.prototype.OPEN;
                SCSocket.CLOSED = SCSocket.prototype.CLOSED = SCTransport.prototype.CLOSED;
                SCSocket.AUTHENTICATED = SCSocket.prototype.AUTHENTICATED = "authenticated";
                SCSocket.UNAUTHENTICATED = SCSocket.prototype.UNAUTHENTICATED = "unauthenticated";
                SCSocket.PENDING = SCSocket.prototype.PENDING = "pending";
                SCSocket.ignoreStatuses = scErrors.socketProtocolIgnoreStatuses;
                SCSocket.errorStatuses = scErrors.socketProtocolErrorStatuses;
                SCSocket.prototype._privateEventHandlerMap = {
                    "#publish": function(data) {
                        var undecoratedChannelName = this._undecorateChannelName(data.channel);
                        var isSubscribed = this.isSubscribed(undecoratedChannelName, true);
                        if (isSubscribed) {
                            this._channelEmitter.emit(undecoratedChannelName, data.data)
                        }
                    },
                    "#kickOut": function(data) {
                        var undecoratedChannelName = this._undecorateChannelName(data.channel);
                        var channel = this._channels[undecoratedChannelName];
                        if (channel) {
                            SCEmitter.prototype.emit.call(this, "kickOut", data.message, undecoratedChannelName);
                            channel.emit("kickOut", data.message, undecoratedChannelName);
                            this._triggerChannelUnsubscribe(channel)
                        }
                    },
                    "#setAuthToken": function(data, response) {
                        var self = this;
                        if (data) {
                            var triggerAuthenticate = function(err) {
                                if (err) {
                                    response.error(err);
                                    self._onSCError(err)
                                } else {
                                    self._changeToAuthenticatedState(data.token);
                                    response.end()
                                }
                            };
                            this.auth.saveToken(this.options.authTokenName, data.token, {}, triggerAuthenticate)
                        } else {
                            response.error(new InvalidMessageError("No token data provided by #setAuthToken event"))
                        }
                    },
                    "#removeAuthToken": function(data, response) {
                        var self = this;
                        this.auth.removeToken(this.options.authTokenName, function(err, oldToken) {
                            if (err) {
                                response.error(err);
                                self._onSCError(err)
                            } else {
                                SCEmitter.prototype.emit.call(self, "removeAuthToken", oldToken);
                                self._changeToUnauthenticatedState();
                                response.end()
                            }
                        })
                    },
                    "#disconnect": function(data) {
                        this.transport.close(data.code, data.data)
                    }
                };
                SCSocket.prototype._callIdGenerator = function() {
                    return this._cid++
                }
                ;
                SCSocket.prototype.getState = function() {
                    return this.state
                }
                ;
                SCSocket.prototype.getBytesReceived = function() {
                    return this.transport.getBytesReceived()
                }
                ;
                SCSocket.prototype.deauthenticate = function(callback) {
                    var self = this;
                    this.auth.removeToken(this.options.authTokenName, function(err, oldToken) {
                        if (err) {
                            self._onSCError(err)
                        } else {
                            self.emit("#removeAuthToken");
                            SCEmitter.prototype.emit.call(self, "removeAuthToken", oldToken);
                            self._changeToUnauthenticatedState()
                        }
                        callback && callback(err)
                    })
                }
                ;
                SCSocket.prototype.connect = SCSocket.prototype.open = function() {
                    var self = this;
                    if (this.state == this.CLOSED) {
                        this.pendingReconnect = false;
                        this.pendingReconnectTimeout = null;
                        clearTimeout(this._reconnectTimeoutRef);
                        this.state = this.CONNECTING;
                        SCEmitter.prototype.emit.call(this, "connecting");
                        this._changeToPendingAuthState();
                        if (this.transport) {
                            this.transport.off()
                        }
                        this.transport = new SCTransport(this.auth,this.codec,this.options);
                        this.transport.on("open", function(status) {
                            self.state = self.OPEN;
                            self._onSCOpen(status)
                        });
                        this.transport.on("error", function(err) {
                            self._onSCError(err)
                        });
                        this.transport.on("close", function(code, data) {
                            self.state = self.CLOSED;
                            self._onSCClose(code, data)
                        });
                        this.transport.on("openAbort", function(code, data) {
                            self.state = self.CLOSED;
                            self._onSCClose(code, data, true)
                        });
                        this.transport.on("event", function(event, data, res) {
                            self._onSCEvent(event, data, res)
                        })
                    }
                }
                ;
                SCSocket.prototype.reconnect = function() {
                    this.disconnect();
                    this.connect()
                }
                ;
                SCSocket.prototype.disconnect = function(code, data) {
                    code = code || 1e3;
                    if (typeof code != "number") {
                        throw new InvalidArgumentsError("If specified, the code argument must be a number")
                    }
                    if (this.state == this.OPEN || this.state == this.CONNECTING) {
                        this.transport.close(code, data)
                    } else {
                        this.pendingReconnect = false;
                        this.pendingReconnectTimeout = null;
                        clearTimeout(this._reconnectTimeoutRef)
                    }
                }
                ;
                SCSocket.prototype._changeToPendingAuthState = function() {
                    if (this.authState != this.PENDING) {
                        var oldState = this.authState;
                        this.authState = this.PENDING;
                        var stateChangeData = {
                            oldState: oldState,
                            newState: this.authState
                        };
                        SCEmitter.prototype.emit.call(this, "authStateChange", stateChangeData)
                    }
                }
                ;
                SCSocket.prototype._changeToUnauthenticatedState = function() {
                    if (this.authState != this.UNAUTHENTICATED) {
                        var oldState = this.authState;
                        this.authState = this.UNAUTHENTICATED;
                        this.signedAuthToken = null;
                        this.authToken = null;
                        var stateChangeData = {
                            oldState: oldState,
                            newState: this.authState
                        };
                        SCEmitter.prototype.emit.call(this, "authStateChange", stateChangeData);
                        if (oldState == this.AUTHENTICATED) {
                            SCEmitter.prototype.emit.call(this, "deauthenticate")
                        }
                        SCEmitter.prototype.emit.call(this, "authTokenChange", this.signedAuthToken)
                    }
                }
                ;
                SCSocket.prototype._changeToAuthenticatedState = function(signedAuthToken) {
                    this.signedAuthToken = signedAuthToken;
                    this.authToken = this._extractAuthTokenData(signedAuthToken);
                    if (this.authState != this.AUTHENTICATED) {
                        var oldState = this.authState;
                        this.authState = this.AUTHENTICATED;
                        var stateChangeData = {
                            oldState: oldState,
                            newState: this.authState,
                            signedAuthToken: signedAuthToken,
                            authToken: this.authToken
                        };
                        this.processPendingSubscriptions();
                        SCEmitter.prototype.emit.call(this, "authStateChange", stateChangeData);
                        SCEmitter.prototype.emit.call(this, "authenticate", signedAuthToken)
                    }
                    SCEmitter.prototype.emit.call(this, "authTokenChange", signedAuthToken)
                }
                ;
                SCSocket.prototype.decodeBase64 = function(encodedString) {
                    var decodedString;
                    if (typeof Buffer == "undefined") {
                        if (global.atob) {
                            decodedString = global.atob(encodedString)
                        } else {
                            decodedString = base64.decode(encodedString)
                        }
                    } else {
                        var buffer = new Buffer(encodedString,"base64");
                        decodedString = buffer.toString("utf8")
                    }
                    return decodedString
                }
                ;
                SCSocket.prototype.encodeBase64 = function(decodedString) {
                    var encodedString;
                    if (typeof Buffer == "undefined") {
                        if (global.btoa) {
                            encodedString = global.btoa(decodedString)
                        } else {
                            encodedString = base64.encode(decodedString)
                        }
                    } else {
                        var buffer = new Buffer(decodedString,"utf8");
                        encodedString = buffer.toString("base64")
                    }
                    return encodedString
                }
                ;
                SCSocket.prototype._extractAuthTokenData = function(signedAuthToken) {
                    var tokenParts = (signedAuthToken || "").split(".");
                    var encodedTokenData = tokenParts[1];
                    if (encodedTokenData != null) {
                        var tokenData = encodedTokenData;
                        try {
                            tokenData = this.decodeBase64(tokenData);
                            return JSON.parse(tokenData)
                        } catch (e) {
                            return tokenData
                        }
                    }
                    return null
                }
                ;
                SCSocket.prototype.getAuthToken = function() {
                    return this.authToken
                }
                ;
                SCSocket.prototype.getSignedAuthToken = function() {
                    return this.signedAuthToken
                }
                ;
                SCSocket.prototype.authenticate = function(signedAuthToken, callback) {
                    var self = this;
                    this._changeToPendingAuthState();
                    this.emit("#authenticate", signedAuthToken, function(err, authStatus) {
                        if (authStatus && authStatus.authError) {
                            authStatus.authError = scErrors.hydrateError(authStatus.authError)
                        }
                        if (err) {
                            self._changeToUnauthenticatedState();
                            callback && callback(err, authStatus)
                        } else {
                            self.auth.saveToken(self.options.authTokenName, signedAuthToken, {}, function(err) {
                                callback && callback(err, authStatus);
                                if (err) {
                                    self._changeToUnauthenticatedState();
                                    self._onSCError(err)
                                } else {
                                    if (authStatus.isAuthenticated) {
                                        self._changeToAuthenticatedState(signedAuthToken)
                                    } else {
                                        self._changeToUnauthenticatedState()
                                    }
                                }
                            })
                        }
                    })
                }
                ;
                SCSocket.prototype._tryReconnect = function(initialDelay) {
                    var self = this;
                    var exponent = this.connectAttempts++;
                    var reconnectOptions = this.options.autoReconnectOptions;
                    var timeout;
                    if (initialDelay == null || exponent > 0) {
                        var initialTimeout = Math.round(reconnectOptions.initialDelay + (reconnectOptions.randomness || 0) * Math.random());
                        timeout = Math.round(initialTimeout * Math.pow(reconnectOptions.multiplier, exponent))
                    } else {
                        timeout = initialDelay
                    }
                    if (timeout > reconnectOptions.maxDelay) {
                        timeout = reconnectOptions.maxDelay
                    }
                    clearTimeout(this._reconnectTimeoutRef);
                    this.pendingReconnect = true;
                    this.pendingReconnectTimeout = timeout;
                    this._reconnectTimeoutRef = setTimeout(function() {
                        self.connect()
                    }, timeout)
                }
                ;
                SCSocket.prototype._onSCOpen = function(status) {
                    var self = this;
                    if (status) {
                        this.id = status.id;
                        this.pingTimeout = status.pingTimeout;
                        this.transport.pingTimeout = this.pingTimeout;
                        if (status.isAuthenticated) {
                            this._changeToAuthenticatedState(status.authToken)
                        } else {
                            this._changeToUnauthenticatedState()
                        }
                    } else {
                        this._changeToUnauthenticatedState()
                    }
                    this.connectAttempts = 0;
                    if (this.options.autoProcessSubscriptions) {
                        this.processPendingSubscriptions()
                    } else {
                        this.pendingConnectCallback = true
                    }
                    SCEmitter.prototype.emit.call(this, "connect", status, function() {
                        self.processPendingSubscriptions()
                    });
                    this._flushEmitBuffer()
                }
                ;
                SCSocket.prototype._onSCError = function(err) {
                    var self = this;
                    setTimeout(function() {
                        if (self.listeners("error").length < 1) {
                            throw err
                        } else {
                            SCEmitter.prototype.emit.call(self, "error", err)
                        }
                    }, 0)
                }
                ;
                SCSocket.prototype._suspendSubscriptions = function() {
                    var channel, newState;
                    for (var channelName in this._channels) {
                        if (this._channels.hasOwnProperty(channelName)) {
                            channel = this._channels[channelName];
                            if (channel.state == channel.SUBSCRIBED || channel.state == channel.PENDING) {
                                newState = channel.PENDING
                            } else {
                                newState = channel.UNSUBSCRIBED
                            }
                            this._triggerChannelUnsubscribe(channel, newState)
                        }
                    }
                }
                ;
                SCSocket.prototype._onSCClose = function(code, data, openAbort) {
                    var self = this;
                    this.id = null;
                    if (this.transport) {
                        this.transport.off()
                    }
                    this.pendingReconnect = false;
                    this.pendingReconnectTimeout = null;
                    clearTimeout(this._reconnectTimeoutRef);
                    this._changeToPendingAuthState();
                    this._suspendSubscriptions();
                    if (this.options.autoReconnect) {
                        if (code == 4e3 || code == 4001 || code == 1005) {
                            this._tryReconnect(0)
                        } else if (code != 1e3 && code < 4500) {
                            this._tryReconnect()
                        }
                    }
                    if (openAbort) {
                        SCEmitter.prototype.emit.call(self, "connectAbort", code, data)
                    } else {
                        SCEmitter.prototype.emit.call(self, "disconnect", code, data)
                    }
                    if (!SCSocket.ignoreStatuses[code]) {
                        var failureMessage;
                        if (data) {
                            failureMessage = "Socket connection failed: " + data
                        } else {
                            failureMessage = "Socket connection failed for unknown reasons"
                        }
                        var err = new SocketProtocolError(SCSocket.errorStatuses[code] || failureMessage,code);
                        this._onSCError(err)
                    }
                }
                ;
                SCSocket.prototype._onSCEvent = function(event, data, res) {
                    var handler = this._privateEventHandlerMap[event];
                    if (handler) {
                        handler.call(this, data, res)
                    } else {
                        SCEmitter.prototype.emit.call(this, event, data, function() {
                            res && res.callback.apply(res, arguments)
                        })
                    }
                }
                ;
                SCSocket.prototype.decode = function(message) {
                    return this.transport.decode(message)
                }
                ;
                SCSocket.prototype.encode = function(object) {
                    return this.transport.encode(object)
                }
                ;
                SCSocket.prototype._flushEmitBuffer = function() {
                    var currentNode = this._emitBuffer.head;
                    var nextNode;
                    while (currentNode) {
                        nextNode = currentNode.next;
                        var eventObject = currentNode.data;
                        currentNode.detach();
                        this.transport.emitObject(eventObject);
                        currentNode = nextNode
                    }
                }
                ;
                SCSocket.prototype._handleEventAckTimeout = function(eventObject, eventNode) {
                    if (eventNode) {
                        eventNode.detach()
                    }
                    var callback = eventObject.callback;
                    if (callback) {
                        delete eventObject.callback;
                        var error = new TimeoutError("Event response for '" + eventObject.event + "' timed out");
                        callback.call(eventObject, error, eventObject)
                    }
                }
                ;
                SCSocket.prototype._emit = function(event, data, callback) {
                    var self = this;
                    if (this.state == this.CLOSED) {
                        this.connect()
                    }
                    var eventObject = {
                        event: event,
                        data: data,
                        callback: callback
                    };
                    var eventNode = new LinkedList.Item;
                    if (this.options.cloneData) {
                        eventNode.data = cloneDeep(eventObject)
                    } else {
                        eventNode.data = eventObject
                    }
                    eventObject.timeout = setTimeout(function() {
                        self._handleEventAckTimeout(eventObject, eventNode)
                    }, this.ackTimeout);
                    this._emitBuffer.append(eventNode);
                    if (this.state == this.OPEN) {
                        this._flushEmitBuffer()
                    }
                }
                ;
                SCSocket.prototype.send = function(data) {
                    this.transport.send(data)
                }
                ;
                SCSocket.prototype.emit = function(event, data, callback) {
                    if (this._localEvents[event] == null) {
                        this._emit(event, data, callback)
                    } else {
                        SCEmitter.prototype.emit.call(this, event, data)
                    }
                }
                ;
                SCSocket.prototype.publish = function(channelName, data, callback) {
                    var pubData = {
                        channel: this._decorateChannelName(channelName),
                        data: data
                    };
                    this.emit("#publish", pubData, callback)
                }
                ;
                SCSocket.prototype._triggerChannelSubscribe = function(channel, subscriptionOptions) {
                    var channelName = channel.name;
                    if (channel.state != channel.SUBSCRIBED) {
                        var oldState = channel.state;
                        channel.state = channel.SUBSCRIBED;
                        var stateChangeData = {
                            channel: channelName,
                            oldState: oldState,
                            newState: channel.state,
                            subscriptionOptions: subscriptionOptions
                        };
                        channel.emit("subscribeStateChange", stateChangeData);
                        channel.emit("subscribe", channelName, subscriptionOptions);
                        SCEmitter.prototype.emit.call(this, "subscribeStateChange", stateChangeData);
                        SCEmitter.prototype.emit.call(this, "subscribe", channelName, subscriptionOptions)
                    }
                }
                ;
                SCSocket.prototype._triggerChannelSubscribeFail = function(err, channel, subscriptionOptions) {
                    var channelName = channel.name;
                    var meetsAuthRequirements = !channel.waitForAuth || this.authState == this.AUTHENTICATED;
                    if (channel.state != channel.UNSUBSCRIBED && meetsAuthRequirements) {
                        channel.state = channel.UNSUBSCRIBED;
                        channel.emit("subscribeFail", err, channelName, subscriptionOptions);
                        SCEmitter.prototype.emit.call(this, "subscribeFail", err, channelName, subscriptionOptions)
                    }
                }
                ;
                SCSocket.prototype._cancelPendingSubscribeCallback = function(channel) {
                    if (channel._pendingSubscriptionCid != null) {
                        this.transport.cancelPendingResponse(channel._pendingSubscriptionCid);
                        delete channel._pendingSubscriptionCid
                    }
                }
                ;
                SCSocket.prototype._decorateChannelName = function(channelName) {
                    if (this.channelPrefix) {
                        channelName = this.channelPrefix + channelName
                    }
                    return channelName
                }
                ;
                SCSocket.prototype._undecorateChannelName = function(decoratedChannelName) {
                    if (this.channelPrefix && decoratedChannelName.indexOf(this.channelPrefix) == 0) {
                        return decoratedChannelName.replace(this.channelPrefix, "")
                    }
                    return decoratedChannelName
                }
                ;
                SCSocket.prototype._trySubscribe = function(channel) {
                    var self = this;
                    var meetsAuthRequirements = !channel.waitForAuth || this.authState == this.AUTHENTICATED;
                    if (this.state == this.OPEN && !this.pendingConnectCallback && channel._pendingSubscriptionCid == null && meetsAuthRequirements) {
                        var options = {
                            noTimeout: true
                        };
                        var subscriptionOptions = {
                            channel: this._decorateChannelName(channel.name)
                        };
                        if (channel.waitForAuth) {
                            options.waitForAuth = true;
                            subscriptionOptions.waitForAuth = options.waitForAuth
                        }
                        if (channel.data) {
                            subscriptionOptions.data = channel.data
                        }
                        channel._pendingSubscriptionCid = this.transport.emit("#subscribe", subscriptionOptions, options, function(err) {
                            delete channel._pendingSubscriptionCid;
                            if (err) {
                                self._triggerChannelSubscribeFail(err, channel, subscriptionOptions)
                            } else {
                                self._triggerChannelSubscribe(channel, subscriptionOptions)
                            }
                        });
                        SCEmitter.prototype.emit.call(this, "subscribeRequest", channel.name, subscriptionOptions)
                    }
                }
                ;
                SCSocket.prototype.subscribe = function(channelName, options) {
                    var channel = this._channels[channelName];
                    if (!channel) {
                        channel = new SCChannel(channelName,this,options);
                        this._channels[channelName] = channel
                    } else if (options) {
                        channel.setOptions(options)
                    }
                    if (channel.state == channel.UNSUBSCRIBED) {
                        channel.state = channel.PENDING;
                        this._trySubscribe(channel)
                    }
                    return channel
                }
                ;
                SCSocket.prototype._triggerChannelUnsubscribe = function(channel, newState) {
                    var channelName = channel.name;
                    var oldState = channel.state;
                    if (newState) {
                        channel.state = newState
                    } else {
                        channel.state = channel.UNSUBSCRIBED
                    }
                    this._cancelPendingSubscribeCallback(channel);
                    if (oldState == channel.SUBSCRIBED) {
                        var stateChangeData = {
                            channel: channelName,
                            oldState: oldState,
                            newState: channel.state
                        };
                        channel.emit("subscribeStateChange", stateChangeData);
                        channel.emit("unsubscribe", channelName);
                        SCEmitter.prototype.emit.call(this, "subscribeStateChange", stateChangeData);
                        SCEmitter.prototype.emit.call(this, "unsubscribe", channelName)
                    }
                }
                ;
                SCSocket.prototype._tryUnsubscribe = function(channel) {
                    var self = this;
                    if (this.state == this.OPEN) {
                        var options = {
                            noTimeout: true
                        };
                        this._cancelPendingSubscribeCallback(channel);
                        var decoratedChannelName = this._decorateChannelName(channel.name);
                        this.transport.emit("#unsubscribe", decoratedChannelName, options)
                    }
                }
                ;
                SCSocket.prototype.unsubscribe = function(channelName) {
                    var channel = this._channels[channelName];
                    if (channel) {
                        if (channel.state != channel.UNSUBSCRIBED) {
                            this._triggerChannelUnsubscribe(channel);
                            this._tryUnsubscribe(channel)
                        }
                    }
                }
                ;
                SCSocket.prototype.channel = function(channelName, options) {
                    var currentChannel = this._channels[channelName];
                    if (!currentChannel) {
                        currentChannel = new SCChannel(channelName,this,options);
                        this._channels[channelName] = currentChannel
                    }
                    return currentChannel
                }
                ;
                SCSocket.prototype.destroyChannel = function(channelName) {
                    var channel = this._channels[channelName];
                    channel.unwatch();
                    channel.unsubscribe();
                    delete this._channels[channelName]
                }
                ;
                SCSocket.prototype.subscriptions = function(includePending) {
                    var subs = [];
                    var channel, includeChannel;
                    for (var channelName in this._channels) {
                        if (this._channels.hasOwnProperty(channelName)) {
                            channel = this._channels[channelName];
                            if (includePending) {
                                includeChannel = channel && (channel.state == channel.SUBSCRIBED || channel.state == channel.PENDING)
                            } else {
                                includeChannel = channel && channel.state == channel.SUBSCRIBED
                            }
                            if (includeChannel) {
                                subs.push(channelName)
                            }
                        }
                    }
                    return subs
                }
                ;
                SCSocket.prototype.isSubscribed = function(channelName, includePending) {
                    var channel = this._channels[channelName];
                    if (includePending) {
                        return !!channel && (channel.state == channel.SUBSCRIBED || channel.state == channel.PENDING)
                    }
                    return !!channel && channel.state == channel.SUBSCRIBED
                }
                ;
                SCSocket.prototype.processPendingSubscriptions = function() {
                    var self = this;
                    this.pendingConnectCallback = false;
                    for (var i in this._channels) {
                        if (this._channels.hasOwnProperty(i)) {
                            (function(channel) {
                                if (channel.state == channel.PENDING) {
                                    self._trySubscribe(channel)
                                }
                            }
                            )(this._channels[i])
                        }
                    }
                }
                ;
                SCSocket.prototype.watch = function(channelName, handler) {
                    if (typeof handler != "function") {
                        throw new InvalidArgumentsError("No handler function was provided")
                    }
                    this._channelEmitter.on(channelName, handler)
                }
                ;
                SCSocket.prototype.unwatch = function(channelName, handler) {
                    if (handler) {
                        this._channelEmitter.removeListener(channelName, handler)
                    } else {
                        this._channelEmitter.removeAllListeners(channelName)
                    }
                }
                ;
                SCSocket.prototype.watchers = function(channelName) {
                    return this._channelEmitter.listeners(channelName)
                }
                ;
                module.exports = SCSocket
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {}, require("buffer").Buffer)
        }
        , {
            "./auth": 2,
            "./response": 3,
            "./sctransport": 6,
            "base-64": 8,
            buffer: 20,
            "linked-list": 12,
            "lodash.clonedeep": 13,
            querystring: 24,
            "sc-channel": 14,
            "sc-emitter": 15,
            "sc-errors": 17,
            "sc-formatter": 18
        }],
        5: [function(require, module, exports) {
            (function(global) {
                var SCSocket = require("./scsocket");
                var scErrors = require("sc-errors");
                var InvalidArgumentsError = scErrors.InvalidArgumentsError;
                var _connections = {};
                function getMultiplexId(options) {
                    var protocolPrefix = options.secure ? "https://" : "http://";
                    var queryString = "";
                    if (options.query) {
                        if (typeof options.query == "string") {
                            queryString = options.query
                        } else {
                            var queryArray = [];
                            var queryMap = options.query;
                            for (var key in queryMap) {
                                if (queryMap.hasOwnProperty(key)) {
                                    queryArray.push(key + "=" + queryMap[key])
                                }
                            }
                            if (queryArray.length) {
                                queryString = "?" + queryArray.join("&")
                            }
                        }
                    }
                    var host;
                    if (options.host) {
                        host = options.host
                    } else {
                        host = options.hostname + ":" + options.port
                    }
                    return protocolPrefix + host + options.path + queryString
                }
                function isUrlSecure() {
                    return global.location && location.protocol == "https:"
                }
                function getPort(options, isSecureDefault) {
                    var isSecure = options.secure == null ? isSecureDefault : options.secure;
                    return options.port || (global.location && location.port ? location.port : isSecure ? 443 : 80)
                }
                function connect(options) {
                    var self = this;
                    options = options || {};
                    if (options.host && options.port) {
                        throw new InvalidArgumentsError("The host option should already include the" + " port number in the format hostname:port - Because of this, the host and port options" + " cannot be specified together; use the hostname option instead")
                    }
                    var isSecureDefault = isUrlSecure();
                    var opts = {
                        port: getPort(options, isSecureDefault),
                        hostname: global.location && location.hostname,
                        path: "/socketcluster/",
                        secure: isSecureDefault,
                        autoConnect: true,
                        autoReconnect: true,
                        autoProcessSubscriptions: true,
                        connectTimeout: 2e4,
                        ackTimeout: 1e4,
                        timestampRequests: false,
                        timestampParam: "t",
                        authEngine: null,
                        authTokenName: "socketCluster.authToken",
                        binaryType: "arraybuffer",
                        multiplex: true,
                        cloneData: false
                    };
                    for (var i in options) {
                        if (options.hasOwnProperty(i)) {
                            opts[i] = options[i]
                        }
                    }
                    var multiplexId = getMultiplexId(opts);
                    if (opts.multiplex === false) {
                        return new SCSocket(opts)
                    }
                    if (_connections[multiplexId]) {
                        _connections[multiplexId].connect()
                    } else {
                        _connections[multiplexId] = new SCSocket(opts)
                    }
                    return _connections[multiplexId]
                }
                function destroy(options) {
                    var self = this;
                    options = options || {};
                    var isSecureDefault = isUrlSecure();
                    var opts = {
                        port: getPort(options, isSecureDefault),
                        hostname: global.location && location.hostname,
                        path: "/socketcluster/",
                        secure: isSecureDefault
                    };
                    for (var i in options) {
                        if (options.hasOwnProperty(i)) {
                            opts[i] = options[i]
                        }
                    }
                    var multiplexId = getMultiplexId(opts);
                    var socket = _connections[multiplexId];
                    if (socket) {
                        socket.disconnect()
                    }
                    delete _connections[multiplexId]
                }
                module.exports = {
                    connect: connect,
                    destroy: destroy,
                    connections: _connections
                }
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {
            "./scsocket": 4,
            "sc-errors": 17
        }],
        6: [function(require, module, exports) {
            (function(global) {
                var SCEmitter = require("sc-emitter").SCEmitter;
                var Response = require("./response").Response;
                var querystring = require("querystring");
                var WebSocket;
                var createWebSocket;
                if (global.WebSocket) {
                    WebSocket = global.WebSocket;
                    createWebSocket = function(uri, options) {
                        return new WebSocket(uri)
                    }
                } else {
                    WebSocket = require("ws");
                    createWebSocket = function(uri, options) {
                        return new WebSocket(uri,null,options)
                    }
                }
                var scErrors = require("sc-errors");
                var TimeoutError = scErrors.TimeoutError;
                var SCTransport = function(authEngine, codecEngine, options) {
                    this.state = this.CLOSED;
                    this.auth = authEngine;
                    this.codec = codecEngine;
                    this.options = options;
                    this.connectTimeout = options.connectTimeout;
                    this.pingTimeout = options.ackTimeout;
                    this.callIdGenerator = options.callIdGenerator;
                    this._pingTimeoutTicker = null;
                    this._callbackMap = {};
                    this.open()
                };
                SCTransport.prototype = Object.create(SCEmitter.prototype);
                SCTransport.CONNECTING = SCTransport.prototype.CONNECTING = "connecting";
                SCTransport.OPEN = SCTransport.prototype.OPEN = "open";
                SCTransport.CLOSED = SCTransport.prototype.CLOSED = "closed";
                SCTransport.prototype.uri = function() {
                    var query = this.options.query || {};
                    var schema = this.options.secure ? "wss" : "ws";
                    if (this.options.timestampRequests) {
                        query[this.options.timestampParam] = (new Date).getTime()
                    }
                    query = querystring.encode(query);
                    if (query.length) {
                        query = "?" + query
                    }
                    var host;
                    if (this.options.host) {
                        host = this.options.host
                    } else {
                        var port = "";
                        if (this.options.port && (schema == "wss" && this.options.port != 443 || schema == "ws" && this.options.port != 80)) {
                            port = ":" + this.options.port
                        }
                        host = this.options.hostname + port
                    }
                    return schema + "://" + host + this.options.path + query
                }
                ;
                SCTransport.prototype.open = function() {
                    var self = this;
                    this.state = this.CONNECTING;
                    var uri = this.uri();
                    var wsSocket = createWebSocket(uri, this.options);
                    wsSocket.binaryType = this.options.binaryType;
                    this.socket = wsSocket;
                    wsSocket.onopen = function() {
                        self._onOpen()
                    }
                    ;
                    wsSocket.onclose = function(event) {
                        self._onClose(event.code, event.reason)
                    }
                    ;
                    wsSocket.onmessage = function(message, flags) {
                        self._onMessage(message.data)
                    }
                    ;
                    wsSocket.onerror = function(error) {
                        if (self.state === self.CONNECTING) {
                            self._onClose(1006)
                        }
                    }
                    ;
                    this._connectTimeoutRef = setTimeout(function() {
                        self._onClose(4007);
                        self.socket.close(4007)
                    }, this.connectTimeout)
                }
                ;
                SCTransport.prototype._onOpen = function() {
                    var self = this;
                    clearTimeout(this._connectTimeoutRef);
                    this._resetPingTimeout();
                    this._handshake(function(err, status) {
                        if (err) {
                            self._onError(err);
                            self._onClose(4003);
                            self.socket.close(4003)
                        } else {
                            self.state = self.OPEN;
                            SCEmitter.prototype.emit.call(self, "open", status);
                            self._resetPingTimeout()
                        }
                    })
                }
                ;
                SCTransport.prototype._handshake = function(callback) {
                    var self = this;
                    this.auth.loadToken(this.options.authTokenName, function(err, token) {
                        if (err) {
                            callback(err)
                        } else {
                            var options = {
                                force: true
                            };
                            self.emit("#handshake", {
                                authToken: token
                            }, options, function(err, status) {
                                if (status) {
                                    status.authToken = token;
                                    if (status.authError) {
                                        status.authError = scErrors.hydrateError(status.authError)
                                    }
                                }
                                callback(err, status)
                            })
                        }
                    })
                }
                ;
                SCTransport.prototype._onClose = function(code, data) {
                    delete this.socket.onopen;
                    delete this.socket.onclose;
                    delete this.socket.onmessage;
                    delete this.socket.onerror;
                    clearTimeout(this._connectTimeoutRef);
                    if (this.state == this.OPEN) {
                        this.state = this.CLOSED;
                        SCEmitter.prototype.emit.call(this, "close", code, data)
                    } else if (this.state == this.CONNECTING) {
                        this.state = this.CLOSED;
                        SCEmitter.prototype.emit.call(this, "openAbort", code, data)
                    }
                }
                ;
                SCTransport.prototype._onMessage = function(message) {
                    SCEmitter.prototype.emit.call(this, "event", "message", message);
                    var obj = this.decode(message);
                    if (obj == "#1") {
                        this._resetPingTimeout();
                        if (this.socket.readyState == this.socket.OPEN) {
                            this.sendObject("#2")
                        }
                    } else {
                        var event = obj.event;
                        if (event) {
                            var response = new Response(this,obj.cid);
                            SCEmitter.prototype.emit.call(this, "event", event, obj.data, response)
                        } else if (obj.rid != null) {
                            var eventObject = this._callbackMap[obj.rid];
                            if (eventObject) {
                                clearTimeout(eventObject.timeout);
                                delete this._callbackMap[obj.rid];
                                if (eventObject.callback) {
                                    var rehydratedError = scErrors.hydrateError(obj.error);
                                    eventObject.callback(rehydratedError, obj.data)
                                }
                            }
                        } else {
                            SCEmitter.prototype.emit.call(this, "event", "raw", obj)
                        }
                    }
                }
                ;
                SCTransport.prototype._onError = function(err) {
                    SCEmitter.prototype.emit.call(this, "error", err)
                }
                ;
                SCTransport.prototype._resetPingTimeout = function() {
                    var self = this;
                    var now = (new Date).getTime();
                    clearTimeout(this._pingTimeoutTicker);
                    this._pingTimeoutTicker = setTimeout(function() {
                        self._onClose(4e3);
                        self.socket.close(4e3)
                    }, this.pingTimeout)
                }
                ;
                SCTransport.prototype.getBytesReceived = function() {
                    return this.socket.bytesReceived
                }
                ;
                SCTransport.prototype.close = function(code, data) {
                    code = code || 1e3;
                    if (this.state == this.OPEN) {
                        var packet = {
                            code: code,
                            data: data
                        };
                        this.emit("#disconnect", packet);
                        this._onClose(code, data);
                        this.socket.close(code)
                    } else if (this.state == this.CONNECTING) {
                        this._onClose(code, data);
                        this.socket.close(code)
                    }
                }
                ;
                SCTransport.prototype.emitObject = function(eventObject) {
                    var simpleEventObject = {
                        event: eventObject.event,
                        data: eventObject.data
                    };
                    if (eventObject.callback) {
                        simpleEventObject.cid = eventObject.cid = this.callIdGenerator();
                        this._callbackMap[eventObject.cid] = eventObject
                    }
                    this.sendObject(simpleEventObject);
                    return eventObject.cid || null
                }
                ;
                SCTransport.prototype._handleEventAckTimeout = function(eventObject) {
                    var errorMessage = "Event response for '" + eventObject.event + "' timed out";
                    var error = new TimeoutError(errorMessage);
                    if (eventObject.cid) {
                        delete this._callbackMap[eventObject.cid]
                    }
                    var callback = eventObject.callback;
                    delete eventObject.callback;
                    callback.call(eventObject, error, eventObject)
                }
                ;
                SCTransport.prototype.emit = function(event, data, a, b) {
                    var self = this;
                    var callback, options;
                    if (b) {
                        options = a;
                        callback = b
                    } else {
                        if (a instanceof Function) {
                            options = {};
                            callback = a
                        } else {
                            options = a
                        }
                    }
                    var eventObject = {
                        event: event,
                        data: data,
                        callback: callback
                    };
                    if (callback && !options.noTimeout) {
                        eventObject.timeout = setTimeout(function() {
                            self._handleEventAckTimeout(eventObject)
                        }, this.options.ackTimeout)
                    }
                    var cid = null;
                    if (this.state == this.OPEN || options.force) {
                        cid = this.emitObject(eventObject)
                    }
                    return cid
                }
                ;
                SCTransport.prototype.cancelPendingResponse = function(cid) {
                    delete this._callbackMap[cid]
                }
                ;
                SCTransport.prototype.decode = function(message) {
                    return this.codec.decode(message)
                }
                ;
                SCTransport.prototype.encode = function(object) {
                    return this.codec.encode(object)
                }
                ;
                SCTransport.prototype.send = function(data) {
                    if (this.socket.readyState != this.socket.OPEN) {
                        this._onClose(1005)
                    } else {
                        this.socket.send(data)
                    }
                }
                ;
                SCTransport.prototype.serializeObject = function(object) {
                    var str, formatError;
                    try {
                        str = this.encode(object)
                    } catch (err) {
                        formatError = err;
                        this._onError(formatError)
                    }
                    if (!formatError) {
                        return str
                    }
                    return null
                }
                ;
                SCTransport.prototype.sendObject = function(object) {
                    var str = this.serializeObject(object);
                    if (str != null) {
                        this.send(str)
                    }
                }
                ;
                module.exports.SCTransport = SCTransport
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {
            "./response": 3,
            querystring: 24,
            "sc-emitter": 15,
            "sc-errors": 17,
            ws: 7
        }],
        7: [function(require, module, exports) {
            var global;
            if (typeof WorkerGlobalScope !== "undefined") {
                global = self
            } else {
                global = typeof window != "undefined" && window || function() {
                    return this
                }()
            }
            var WebSocket = global.WebSocket || global.MozWebSocket;
            function ws(uri, protocols, opts) {
                var instance;
                if (protocols) {
                    instance = new WebSocket(uri,protocols)
                } else {
                    instance = new WebSocket(uri)
                }
                return instance
            }
            if (WebSocket)
                ws.prototype = WebSocket.prototype;
            module.exports = WebSocket ? ws : null
        }
        , {}],
        8: [function(require, module, exports) {
            (function(global) {
                (function(root) {
                    var freeExports = typeof exports == "object" && exports;
                    var freeModule = typeof module == "object" && module && module.exports == freeExports && module;
                    var freeGlobal = typeof global == "object" && global;
                    if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
                        root = freeGlobal
                    }
                    var InvalidCharacterError = function(message) {
                        this.message = message
                    };
                    InvalidCharacterError.prototype = new Error;
                    InvalidCharacterError.prototype.name = "InvalidCharacterError";
                    var error = function(message) {
                        throw new InvalidCharacterError(message)
                    };
                    var TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                    var REGEX_SPACE_CHARACTERS = /[\t\n\f\r ]/g;
                    var decode = function(input) {
                        input = String(input).replace(REGEX_SPACE_CHARACTERS, "");
                        var length = input.length;
                        if (length % 4 == 0) {
                            input = input.replace(/==?$/, "");
                            length = input.length
                        }
                        if (length % 4 == 1 || /[^+a-zA-Z0-9\/]/.test(input)) {
                            error("Invalid character: the string to be decoded is not correctly encoded.")
                        }
                        var bitCounter = 0;
                        var bitStorage;
                        var buffer;
                        var output = "";
                        var position = -1;
                        while (++position < length) {
                            buffer = TABLE.indexOf(input.charAt(position));
                            bitStorage = bitCounter % 4 ? bitStorage * 64 + buffer : buffer;
                            if (bitCounter++ % 4) {
                                output += String.fromCharCode(255 & bitStorage >> (-2 * bitCounter & 6))
                            }
                        }
                        return output
                    };
                    var encode = function(input) {
                        input = String(input);
                        if (/[^\0-\xFF]/.test(input)) {
                            error("The string to be encoded contains characters outside of the " + "Latin1 range.")
                        }
                        var padding = input.length % 3;
                        var output = "";
                        var position = -1;
                        var a;
                        var b;
                        var c;
                        var d;
                        var buffer;
                        var length = input.length - padding;
                        while (++position < length) {
                            a = input.charCodeAt(position) << 16;
                            b = input.charCodeAt(++position) << 8;
                            c = input.charCodeAt(++position);
                            buffer = a + b + c;
                            output += TABLE.charAt(buffer >> 18 & 63) + TABLE.charAt(buffer >> 12 & 63) + TABLE.charAt(buffer >> 6 & 63) + TABLE.charAt(buffer & 63)
                        }
                        if (padding == 2) {
                            a = input.charCodeAt(position) << 8;
                            b = input.charCodeAt(++position);
                            buffer = a + b;
                            output += TABLE.charAt(buffer >> 10) + TABLE.charAt(buffer >> 4 & 63) + TABLE.charAt(buffer << 2 & 63) + "="
                        } else if (padding == 1) {
                            buffer = input.charCodeAt(position);
                            output += TABLE.charAt(buffer >> 2) + TABLE.charAt(buffer << 4 & 63) + "=="
                        }
                        return output
                    };
                    var base64 = {
                        encode: encode,
                        decode: decode,
                        version: "0.1.0"
                    };
                    if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
                        define(function() {
                            return base64
                        })
                    } else if (freeExports && !freeExports.nodeType) {
                        if (freeModule) {
                            freeModule.exports = base64
                        } else {
                            for (var key in base64) {
                                base64.hasOwnProperty(key) && (freeExports[key] = base64[key])
                            }
                        }
                    } else {
                        root.base64 = base64
                    }
                }
                )(this)
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {}],
        9: [function(require, module, exports) {
            module.exports = Emitter;
            function Emitter(obj) {
                if (obj)
                    return mixin(obj)
            }
            function mixin(obj) {
                for (var key in Emitter.prototype) {
                    obj[key] = Emitter.prototype[key]
                }
                return obj
            }
            Emitter.prototype.on = Emitter.prototype.addEventListener = function(event, fn) {
                this._callbacks = this._callbacks || {};
                (this._callbacks["$" + event] = this._callbacks["$" + event] || []).push(fn);
                return this
            }
            ;
            Emitter.prototype.once = function(event, fn) {
                function on() {
                    this.off(event, on);
                    fn.apply(this, arguments)
                }
                on.fn = fn;
                this.on(event, on);
                return this
            }
            ;
            Emitter.prototype.off = Emitter.prototype.removeListener = Emitter.prototype.removeAllListeners = Emitter.prototype.removeEventListener = function(event, fn) {
                this._callbacks = this._callbacks || {};
                if (0 == arguments.length) {
                    this._callbacks = {};
                    return this
                }
                var callbacks = this._callbacks["$" + event];
                if (!callbacks)
                    return this;
                if (1 == arguments.length) {
                    delete this._callbacks["$" + event];
                    return this
                }
                var cb;
                for (var i = 0; i < callbacks.length; i++) {
                    cb = callbacks[i];
                    if (cb === fn || cb.fn === fn) {
                        callbacks.splice(i, 1);
                        break
                    }
                }
                return this
            }
            ;
            Emitter.prototype.emit = function(event) {
                this._callbacks = this._callbacks || {};
                var args = [].slice.call(arguments, 1)
                  , callbacks = this._callbacks["$" + event];
                if (callbacks) {
                    callbacks = callbacks.slice(0);
                    for (var i = 0, len = callbacks.length; i < len; ++i) {
                        callbacks[i].apply(this, args)
                    }
                }
                return this
            }
            ;
            Emitter.prototype.listeners = function(event) {
                this._callbacks = this._callbacks || {};
                return this._callbacks["$" + event] || []
            }
            ;
            Emitter.prototype.hasListeners = function(event) {
                return !!this.listeners(event).length
            }
        }
        , {}],
        10: [function(require, module, exports) {
            var cycle = exports;
            cycle.decycle = function decycle(object) {
                "use strict";
                var objects = []
                  , paths = [];
                return function derez(value, path) {
                    var i, name, nu;
                    if (typeof value === "object" && value !== null && !(value instanceof Boolean) && !(value instanceof Date) && !(value instanceof Number) && !(value instanceof RegExp) && !(value instanceof String)) {
                        for (i = 0; i < objects.length; i += 1) {
                            if (objects[i] === value) {
                                return {
                                    $ref: paths[i]
                                }
                            }
                        }
                        objects.push(value);
                        paths.push(path);
                        if (Object.prototype.toString.apply(value) === "[object Array]") {
                            nu = [];
                            for (i = 0; i < value.length; i += 1) {
                                nu[i] = derez(value[i], path + "[" + i + "]")
                            }
                        } else {
                            nu = {};
                            for (name in value) {
                                if (Object.prototype.hasOwnProperty.call(value, name)) {
                                    nu[name] = derez(value[name], path + "[" + JSON.stringify(name) + "]")
                                }
                            }
                        }
                        return nu
                    }
                    return value
                }(object, "$")
            }
            ;
            cycle.retrocycle = function retrocycle($) {
                "use strict";
                var px = /^\$(?:\[(?:\d+|\"(?:[^\\\"\u0000-\u001f]|\\([\\\"\/bfnrt]|u[0-9a-zA-Z]{4}))*\")\])*$/;
                (function rez(value) {
                    var i, item, name, path;
                    if (value && typeof value === "object") {
                        if (Object.prototype.toString.apply(value) === "[object Array]") {
                            for (i = 0; i < value.length; i += 1) {
                                item = value[i];
                                if (item && typeof item === "object") {
                                    path = item.$ref;
                                    if (typeof path === "string" && px.test(path)) {
                                        value[i] = eval(path)
                                    } else {
                                        rez(item)
                                    }
                                }
                            }
                        } else {
                            for (name in value) {
                                if (typeof value[name] === "object") {
                                    item = value[name];
                                    if (item) {
                                        path = item.$ref;
                                        if (typeof path === "string" && px.test(path)) {
                                            value[name] = eval(path)
                                        } else {
                                            rez(item)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                )($);
                return $
            }
        }
        , {}],
        11: [function(require, module, exports) {
            "use strict";
            var errorMessage;
            errorMessage = "An argument without append, prepend, " + "or detach methods was given to `List";
            function List() {
                if (arguments.length) {
                    return List.from(arguments)
                }
            }
            var ListPrototype;
            ListPrototype = List.prototype;
            List.of = function() {
                return List.from.call(this, arguments)
            }
            ;
            List.from = function(items) {
                var list = new this, length, iterator, item;
                if (items && (length = items.length)) {
                    iterator = -1;
                    while (++iterator < length) {
                        item = items[iterator];
                        if (item !== null && item !== undefined) {
                            list.append(item)
                        }
                    }
                }
                return list
            }
            ;
            ListPrototype.head = null;
            ListPrototype.tail = null;
            ListPrototype.toArray = function() {
                var item = this.head
                  , result = [];
                while (item) {
                    result.push(item);
                    item = item.next
                }
                return result
            }
            ;
            ListPrototype.prepend = function(item) {
                if (!item) {
                    return false
                }
                if (!item.append || !item.prepend || !item.detach) {
                    throw new Error(errorMessage + "#prepend`.")
                }
                var self, head;
                self = this;
                head = self.head;
                if (head) {
                    return head.prepend(item)
                }
                item.detach();
                item.list = self;
                self.head = item;
                return item
            }
            ;
            ListPrototype.append = function(item) {
                if (!item) {
                    return false
                }
                if (!item.append || !item.prepend || !item.detach) {
                    throw new Error(errorMessage + "#append`.")
                }
                var self, head, tail;
                self = this;
                tail = self.tail;
                if (tail) {
                    return tail.append(item)
                }
                head = self.head;
                if (head) {
                    return head.append(item)
                }
                item.detach();
                item.list = self;
                self.head = item;
                return item
            }
            ;
            function ListItem() {}
            List.Item = ListItem;
            var ListItemPrototype = ListItem.prototype;
            ListItemPrototype.next = null;
            ListItemPrototype.prev = null;
            ListItemPrototype.list = null;
            ListItemPrototype.detach = function() {
                var self = this
                  , list = self.list
                  , prev = self.prev
                  , next = self.next;
                if (!list) {
                    return self
                }
                if (list.tail === self) {
                    list.tail = prev
                }
                if (list.head === self) {
                    list.head = next
                }
                if (list.tail === list.head) {
                    list.tail = null
                }
                if (prev) {
                    prev.next = next
                }
                if (next) {
                    next.prev = prev
                }
                self.prev = self.next = self.list = null;
                return self
            }
            ;
            ListItemPrototype.prepend = function(item) {
                if (!item || !item.append || !item.prepend || !item.detach) {
                    throw new Error(errorMessage + "Item#prepend`.")
                }
                var self = this
                  , list = self.list
                  , prev = self.prev;
                if (!list) {
                    return false
                }
                item.detach();
                if (prev) {
                    item.prev = prev;
                    prev.next = item
                }
                item.next = self;
                item.list = list;
                self.prev = item;
                if (self === list.head) {
                    list.head = item
                }
                if (!list.tail) {
                    list.tail = self
                }
                return item
            }
            ;
            ListItemPrototype.append = function(item) {
                if (!item || !item.append || !item.prepend || !item.detach) {
                    throw new Error(errorMessage + "Item#append`.")
                }
                var self = this
                  , list = self.list
                  , next = self.next;
                if (!list) {
                    return false
                }
                item.detach();
                if (next) {
                    item.next = next;
                    next.prev = item
                }
                item.prev = self;
                item.list = list;
                self.next = item;
                if (self === list.tail || !list.tail) {
                    list.tail = item
                }
                return item
            }
            ;
            module.exports = List
        }
        , {}],
        12: [function(require, module, exports) {
            "use strict";
            module.exports = require("./_source/linked-list.js")
        }
        , {
            "./_source/linked-list.js": 11
        }],
        13: [function(require, module, exports) {
            (function(global) {
                var LARGE_ARRAY_SIZE = 200;
                var HASH_UNDEFINED = "__lodash_hash_undefined__";
                var MAX_SAFE_INTEGER = 9007199254740991;
                var argsTag = "[object Arguments]"
                  , arrayTag = "[object Array]"
                  , boolTag = "[object Boolean]"
                  , dateTag = "[object Date]"
                  , errorTag = "[object Error]"
                  , funcTag = "[object Function]"
                  , genTag = "[object GeneratorFunction]"
                  , mapTag = "[object Map]"
                  , numberTag = "[object Number]"
                  , objectTag = "[object Object]"
                  , promiseTag = "[object Promise]"
                  , regexpTag = "[object RegExp]"
                  , setTag = "[object Set]"
                  , stringTag = "[object String]"
                  , symbolTag = "[object Symbol]"
                  , weakMapTag = "[object WeakMap]";
                var arrayBufferTag = "[object ArrayBuffer]"
                  , dataViewTag = "[object DataView]"
                  , float32Tag = "[object Float32Array]"
                  , float64Tag = "[object Float64Array]"
                  , int8Tag = "[object Int8Array]"
                  , int16Tag = "[object Int16Array]"
                  , int32Tag = "[object Int32Array]"
                  , uint8Tag = "[object Uint8Array]"
                  , uint8ClampedTag = "[object Uint8ClampedArray]"
                  , uint16Tag = "[object Uint16Array]"
                  , uint32Tag = "[object Uint32Array]";
                var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
                var reFlags = /\w*$/;
                var reIsHostCtor = /^\[object .+?Constructor\]$/;
                var reIsUint = /^(?:0|[1-9]\d*)$/;
                var cloneableTags = {};
                cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
                cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
                var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
                var freeSelf = typeof self == "object" && self && self.Object === Object && self;
                var root = freeGlobal || freeSelf || Function("return this")();
                var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
                var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
                var moduleExports = freeModule && freeModule.exports === freeExports;
                function addMapEntry(map, pair) {
                    map.set(pair[0], pair[1]);
                    return map
                }
                function addSetEntry(set, value) {
                    set.add(value);
                    return set
                }
                function arrayEach(array, iteratee) {
                    var index = -1
                      , length = array ? array.length : 0;
                    while (++index < length) {
                        if (iteratee(array[index], index, array) === false) {
                            break
                        }
                    }
                    return array
                }
                function arrayPush(array, values) {
                    var index = -1
                      , length = values.length
                      , offset = array.length;
                    while (++index < length) {
                        array[offset + index] = values[index]
                    }
                    return array
                }
                function arrayReduce(array, iteratee, accumulator, initAccum) {
                    var index = -1
                      , length = array ? array.length : 0;
                    if (initAccum && length) {
                        accumulator = array[++index]
                    }
                    while (++index < length) {
                        accumulator = iteratee(accumulator, array[index], index, array)
                    }
                    return accumulator
                }
                function baseTimes(n, iteratee) {
                    var index = -1
                      , result = Array(n);
                    while (++index < n) {
                        result[index] = iteratee(index)
                    }
                    return result
                }
                function getValue(object, key) {
                    return object == null ? undefined : object[key]
                }
                function isHostObject(value) {
                    var result = false;
                    if (value != null && typeof value.toString != "function") {
                        try {
                            result = !!(value + "")
                        } catch (e) {}
                    }
                    return result
                }
                function mapToArray(map) {
                    var index = -1
                      , result = Array(map.size);
                    map.forEach(function(value, key) {
                        result[++index] = [key, value]
                    });
                    return result
                }
                function overArg(func, transform) {
                    return function(arg) {
                        return func(transform(arg))
                    }
                }
                function setToArray(set) {
                    var index = -1
                      , result = Array(set.size);
                    set.forEach(function(value) {
                        result[++index] = value
                    });
                    return result
                }
                var arrayProto = Array.prototype
                  , funcProto = Function.prototype
                  , objectProto = Object.prototype;
                var coreJsData = root["__core-js_shared__"];
                var maskSrcKey = function() {
                    var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
                    return uid ? "Symbol(src)_1." + uid : ""
                }();
                var funcToString = funcProto.toString;
                var hasOwnProperty = objectProto.hasOwnProperty;
                var objectToString = objectProto.toString;
                var reIsNative = RegExp("^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
                var Buffer = moduleExports ? root.Buffer : undefined
                  , Symbol = root.Symbol
                  , Uint8Array = root.Uint8Array
                  , getPrototype = overArg(Object.getPrototypeOf, Object)
                  , objectCreate = Object.create
                  , propertyIsEnumerable = objectProto.propertyIsEnumerable
                  , splice = arrayProto.splice;
                var nativeGetSymbols = Object.getOwnPropertySymbols
                  , nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined
                  , nativeKeys = overArg(Object.keys, Object);
                var DataView = getNative(root, "DataView")
                  , Map = getNative(root, "Map")
                  , Promise = getNative(root, "Promise")
                  , Set = getNative(root, "Set")
                  , WeakMap = getNative(root, "WeakMap")
                  , nativeCreate = getNative(Object, "create");
                var dataViewCtorString = toSource(DataView)
                  , mapCtorString = toSource(Map)
                  , promiseCtorString = toSource(Promise)
                  , setCtorString = toSource(Set)
                  , weakMapCtorString = toSource(WeakMap);
                var symbolProto = Symbol ? Symbol.prototype : undefined
                  , symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;
                function Hash(entries) {
                    var index = -1
                      , length = entries ? entries.length : 0;
                    this.clear();
                    while (++index < length) {
                        var entry = entries[index];
                        this.set(entry[0], entry[1])
                    }
                }
                function hashClear() {
                    this.__data__ = nativeCreate ? nativeCreate(null) : {}
                }
                function hashDelete(key) {
                    return this.has(key) && delete this.__data__[key]
                }
                function hashGet(key) {
                    var data = this.__data__;
                    if (nativeCreate) {
                        var result = data[key];
                        return result === HASH_UNDEFINED ? undefined : result
                    }
                    return hasOwnProperty.call(data, key) ? data[key] : undefined
                }
                function hashHas(key) {
                    var data = this.__data__;
                    return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key)
                }
                function hashSet(key, value) {
                    var data = this.__data__;
                    data[key] = nativeCreate && value === undefined ? HASH_UNDEFINED : value;
                    return this
                }
                Hash.prototype.clear = hashClear;
                Hash.prototype["delete"] = hashDelete;
                Hash.prototype.get = hashGet;
                Hash.prototype.has = hashHas;
                Hash.prototype.set = hashSet;
                function ListCache(entries) {
                    var index = -1
                      , length = entries ? entries.length : 0;
                    this.clear();
                    while (++index < length) {
                        var entry = entries[index];
                        this.set(entry[0], entry[1])
                    }
                }
                function listCacheClear() {
                    this.__data__ = []
                }
                function listCacheDelete(key) {
                    var data = this.__data__
                      , index = assocIndexOf(data, key);
                    if (index < 0) {
                        return false
                    }
                    var lastIndex = data.length - 1;
                    if (index == lastIndex) {
                        data.pop()
                    } else {
                        splice.call(data, index, 1)
                    }
                    return true
                }
                function listCacheGet(key) {
                    var data = this.__data__
                      , index = assocIndexOf(data, key);
                    return index < 0 ? undefined : data[index][1]
                }
                function listCacheHas(key) {
                    return assocIndexOf(this.__data__, key) > -1
                }
                function listCacheSet(key, value) {
                    var data = this.__data__
                      , index = assocIndexOf(data, key);
                    if (index < 0) {
                        data.push([key, value])
                    } else {
                        data[index][1] = value
                    }
                    return this
                }
                ListCache.prototype.clear = listCacheClear;
                ListCache.prototype["delete"] = listCacheDelete;
                ListCache.prototype.get = listCacheGet;
                ListCache.prototype.has = listCacheHas;
                ListCache.prototype.set = listCacheSet;
                function MapCache(entries) {
                    var index = -1
                      , length = entries ? entries.length : 0;
                    this.clear();
                    while (++index < length) {
                        var entry = entries[index];
                        this.set(entry[0], entry[1])
                    }
                }
                function mapCacheClear() {
                    this.__data__ = {
                        hash: new Hash,
                        map: new (Map || ListCache),
                        string: new Hash
                    }
                }
                function mapCacheDelete(key) {
                    return getMapData(this, key)["delete"](key)
                }
                function mapCacheGet(key) {
                    return getMapData(this, key).get(key)
                }
                function mapCacheHas(key) {
                    return getMapData(this, key).has(key)
                }
                function mapCacheSet(key, value) {
                    getMapData(this, key).set(key, value);
                    return this
                }
                MapCache.prototype.clear = mapCacheClear;
                MapCache.prototype["delete"] = mapCacheDelete;
                MapCache.prototype.get = mapCacheGet;
                MapCache.prototype.has = mapCacheHas;
                MapCache.prototype.set = mapCacheSet;
                function Stack(entries) {
                    this.__data__ = new ListCache(entries)
                }
                function stackClear() {
                    this.__data__ = new ListCache
                }
                function stackDelete(key) {
                    return this.__data__["delete"](key)
                }
                function stackGet(key) {
                    return this.__data__.get(key)
                }
                function stackHas(key) {
                    return this.__data__.has(key)
                }
                function stackSet(key, value) {
                    var cache = this.__data__;
                    if (cache instanceof ListCache) {
                        var pairs = cache.__data__;
                        if (!Map || pairs.length < LARGE_ARRAY_SIZE - 1) {
                            pairs.push([key, value]);
                            return this
                        }
                        cache = this.__data__ = new MapCache(pairs)
                    }
                    cache.set(key, value);
                    return this
                }
                Stack.prototype.clear = stackClear;
                Stack.prototype["delete"] = stackDelete;
                Stack.prototype.get = stackGet;
                Stack.prototype.has = stackHas;
                Stack.prototype.set = stackSet;
                function arrayLikeKeys(value, inherited) {
                    var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
                    var length = result.length
                      , skipIndexes = !!length;
                    for (var key in value) {
                        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) {
                            result.push(key)
                        }
                    }
                    return result
                }
                function assignValue(object, key, value) {
                    var objValue = object[key];
                    if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === undefined && !(key in object)) {
                        object[key] = value
                    }
                }
                function assocIndexOf(array, key) {
                    var length = array.length;
                    while (length--) {
                        if (eq(array[length][0], key)) {
                            return length
                        }
                    }
                    return -1
                }
                function baseAssign(object, source) {
                    return object && copyObject(source, keys(source), object)
                }
                function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
                    var result;
                    if (customizer) {
                        result = object ? customizer(value, key, object, stack) : customizer(value)
                    }
                    if (result !== undefined) {
                        return result
                    }
                    if (!isObject(value)) {
                        return value
                    }
                    var isArr = isArray(value);
                    if (isArr) {
                        result = initCloneArray(value);
                        if (!isDeep) {
                            return copyArray(value, result)
                        }
                    } else {
                        var tag = getTag(value)
                          , isFunc = tag == funcTag || tag == genTag;
                        if (isBuffer(value)) {
                            return cloneBuffer(value, isDeep)
                        }
                        if (tag == objectTag || tag == argsTag || isFunc && !object) {
                            if (isHostObject(value)) {
                                return object ? value : {}
                            }
                            result = initCloneObject(isFunc ? {} : value);
                            if (!isDeep) {
                                return copySymbols(value, baseAssign(result, value))
                            }
                        } else {
                            if (!cloneableTags[tag]) {
                                return object ? value : {}
                            }
                            result = initCloneByTag(value, tag, baseClone, isDeep)
                        }
                    }
                    stack || (stack = new Stack);
                    var stacked = stack.get(value);
                    if (stacked) {
                        return stacked
                    }
                    stack.set(value, result);
                    if (!isArr) {
                        var props = isFull ? getAllKeys(value) : keys(value)
                    }
                    arrayEach(props || value, function(subValue, key) {
                        if (props) {
                            key = subValue;
                            subValue = value[key]
                        }
                        assignValue(result, key, baseClone(subValue, isDeep, isFull, customizer, key, value, stack))
                    });
                    return result
                }
                function baseCreate(proto) {
                    return isObject(proto) ? objectCreate(proto) : {}
                }
                function baseGetAllKeys(object, keysFunc, symbolsFunc) {
                    var result = keysFunc(object);
                    return isArray(object) ? result : arrayPush(result, symbolsFunc(object))
                }
                function baseGetTag(value) {
                    return objectToString.call(value)
                }
                function baseIsNative(value) {
                    if (!isObject(value) || isMasked(value)) {
                        return false
                    }
                    var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
                    return pattern.test(toSource(value))
                }
                function baseKeys(object) {
                    if (!isPrototype(object)) {
                        return nativeKeys(object)
                    }
                    var result = [];
                    for (var key in Object(object)) {
                        if (hasOwnProperty.call(object, key) && key != "constructor") {
                            result.push(key)
                        }
                    }
                    return result
                }
                function cloneBuffer(buffer, isDeep) {
                    if (isDeep) {
                        return buffer.slice()
                    }
                    var result = new buffer.constructor(buffer.length);
                    buffer.copy(result);
                    return result
                }
                function cloneArrayBuffer(arrayBuffer) {
                    var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
                    new Uint8Array(result).set(new Uint8Array(arrayBuffer));
                    return result
                }
                function cloneDataView(dataView, isDeep) {
                    var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
                    return new dataView.constructor(buffer,dataView.byteOffset,dataView.byteLength)
                }
                function cloneMap(map, isDeep, cloneFunc) {
                    var array = isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map);
                    return arrayReduce(array, addMapEntry, new map.constructor)
                }
                function cloneRegExp(regexp) {
                    var result = new regexp.constructor(regexp.source,reFlags.exec(regexp));
                    result.lastIndex = regexp.lastIndex;
                    return result
                }
                function cloneSet(set, isDeep, cloneFunc) {
                    var array = isDeep ? cloneFunc(setToArray(set), true) : setToArray(set);
                    return arrayReduce(array, addSetEntry, new set.constructor)
                }
                function cloneSymbol(symbol) {
                    return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {}
                }
                function cloneTypedArray(typedArray, isDeep) {
                    var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
                    return new typedArray.constructor(buffer,typedArray.byteOffset,typedArray.length)
                }
                function copyArray(source, array) {
                    var index = -1
                      , length = source.length;
                    array || (array = Array(length));
                    while (++index < length) {
                        array[index] = source[index]
                    }
                    return array
                }
                function copyObject(source, props, object, customizer) {
                    object || (object = {});
                    var index = -1
                      , length = props.length;
                    while (++index < length) {
                        var key = props[index];
                        var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined;
                        assignValue(object, key, newValue === undefined ? source[key] : newValue)
                    }
                    return object
                }
                function copySymbols(source, object) {
                    return copyObject(source, getSymbols(source), object)
                }
                function getAllKeys(object) {
                    return baseGetAllKeys(object, keys, getSymbols)
                }
                function getMapData(map, key) {
                    var data = map.__data__;
                    return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map
                }
                function getNative(object, key) {
                    var value = getValue(object, key);
                    return baseIsNative(value) ? value : undefined
                }
                var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;
                var getTag = baseGetTag;
                if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map && getTag(new Map) != mapTag || Promise && getTag(Promise.resolve()) != promiseTag || Set && getTag(new Set) != setTag || WeakMap && getTag(new WeakMap) != weakMapTag) {
                    getTag = function(value) {
                        var result = objectToString.call(value)
                          , Ctor = result == objectTag ? value.constructor : undefined
                          , ctorString = Ctor ? toSource(Ctor) : undefined;
                        if (ctorString) {
                            switch (ctorString) {
                            case dataViewCtorString:
                                return dataViewTag;
                            case mapCtorString:
                                return mapTag;
                            case promiseCtorString:
                                return promiseTag;
                            case setCtorString:
                                return setTag;
                            case weakMapCtorString:
                                return weakMapTag
                            }
                        }
                        return result
                    }
                }
                function initCloneArray(array) {
                    var length = array.length
                      , result = array.constructor(length);
                    if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
                        result.index = array.index;
                        result.input = array.input
                    }
                    return result
                }
                function initCloneObject(object) {
                    return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {}
                }
                function initCloneByTag(object, tag, cloneFunc, isDeep) {
                    var Ctor = object.constructor;
                    switch (tag) {
                    case arrayBufferTag:
                        return cloneArrayBuffer(object);
                    case boolTag:
                    case dateTag:
                        return new Ctor(+object);
                    case dataViewTag:
                        return cloneDataView(object, isDeep);
                    case float32Tag:
                    case float64Tag:
                    case int8Tag:
                    case int16Tag:
                    case int32Tag:
                    case uint8Tag:
                    case uint8ClampedTag:
                    case uint16Tag:
                    case uint32Tag:
                        return cloneTypedArray(object, isDeep);
                    case mapTag:
                        return cloneMap(object, isDeep, cloneFunc);
                    case numberTag:
                    case stringTag:
                        return new Ctor(object);
                    case regexpTag:
                        return cloneRegExp(object);
                    case setTag:
                        return cloneSet(object, isDeep, cloneFunc);
                    case symbolTag:
                        return cloneSymbol(object)
                    }
                }
                function isIndex(value, length) {
                    length = length == null ? MAX_SAFE_INTEGER : length;
                    return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length)
                }
                function isKeyable(value) {
                    var type = typeof value;
                    return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null
                }
                function isMasked(func) {
                    return !!maskSrcKey && maskSrcKey in func
                }
                function isPrototype(value) {
                    var Ctor = value && value.constructor
                      , proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
                    return value === proto
                }
                function toSource(func) {
                    if (func != null) {
                        try {
                            return funcToString.call(func)
                        } catch (e) {}
                        try {
                            return func + ""
                        } catch (e) {}
                    }
                    return ""
                }
                function cloneDeep(value) {
                    return baseClone(value, true, true)
                }
                function eq(value, other) {
                    return value === other || value !== value && other !== other
                }
                function isArguments(value) {
                    return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag)
                }
                var isArray = Array.isArray;
                function isArrayLike(value) {
                    return value != null && isLength(value.length) && !isFunction(value)
                }
                function isArrayLikeObject(value) {
                    return isObjectLike(value) && isArrayLike(value)
                }
                var isBuffer = nativeIsBuffer || stubFalse;
                function isFunction(value) {
                    var tag = isObject(value) ? objectToString.call(value) : "";
                    return tag == funcTag || tag == genTag
                }
                function isLength(value) {
                    return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER
                }
                function isObject(value) {
                    var type = typeof value;
                    return !!value && (type == "object" || type == "function")
                }
                function isObjectLike(value) {
                    return !!value && typeof value == "object"
                }
                function keys(object) {
                    return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object)
                }
                function stubArray() {
                    return []
                }
                function stubFalse() {
                    return false
                }
                module.exports = cloneDeep
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {}],
        14: [function(require, module, exports) {
            var SCEmitter = require("sc-emitter").SCEmitter;
            var SCChannel = function(name, client, options) {
                var self = this;
                SCEmitter.call(this);
                this.PENDING = "pending";
                this.SUBSCRIBED = "subscribed";
                this.UNSUBSCRIBED = "unsubscribed";
                this.name = name;
                this.state = this.UNSUBSCRIBED;
                this.client = client;
                this.options = options || {};
                this.setOptions(this.options)
            };
            SCChannel.prototype = Object.create(SCEmitter.prototype);
            SCChannel.prototype.setOptions = function(options) {
                if (!options) {
                    options = {}
                }
                this.waitForAuth = options.waitForAuth || false;
                if (options.data !== undefined) {
                    this.data = options.data
                }
            }
            ;
            SCChannel.prototype.getState = function() {
                return this.state
            }
            ;
            SCChannel.prototype.subscribe = function(options) {
                this.client.subscribe(this.name, options)
            }
            ;
            SCChannel.prototype.unsubscribe = function() {
                this.client.unsubscribe(this.name)
            }
            ;
            SCChannel.prototype.isSubscribed = function(includePending) {
                return this.client.isSubscribed(this.name, includePending)
            }
            ;
            SCChannel.prototype.publish = function(data, callback) {
                this.client.publish(this.name, data, callback)
            }
            ;
            SCChannel.prototype.watch = function(handler) {
                this.client.watch(this.name, handler)
            }
            ;
            SCChannel.prototype.unwatch = function(handler) {
                this.client.unwatch(this.name, handler)
            }
            ;
            SCChannel.prototype.watchers = function() {
                return this.client.watchers(this.name)
            }
            ;
            SCChannel.prototype.destroy = function() {
                this.client.destroyChannel(this.name)
            }
            ;
            module.exports.SCChannel = SCChannel
        }
        , {
            "sc-emitter": 15
        }],
        15: [function(require, module, exports) {
            var Emitter = require("component-emitter");
            if (!Object.create) {
                Object.create = require("./objectcreate")
            }
            var SCEmitter = function() {
                Emitter.call(this)
            };
            SCEmitter.prototype = Object.create(Emitter.prototype);
            SCEmitter.prototype.emit = function(event) {
                if (event == "error") {
                    var domainErrorArgs = ["__domainError"];
                    if (arguments[1] !== undefined) {
                        domainErrorArgs.push(arguments[1])
                    }
                    Emitter.prototype.emit.apply(this, domainErrorArgs);
                    if (this.domain) {
                        var err = arguments[1];
                        if (!err) {
                            err = new Error('Uncaught, unspecified "error" event.')
                        }
                        err.domainEmitter = this;
                        err.domain = this.domain;
                        err.domainThrown = false;
                        this.domain.emit("error", err)
                    }
                }
                Emitter.prototype.emit.apply(this, arguments)
            }
            ;
            module.exports.SCEmitter = SCEmitter
        }
        , {
            "./objectcreate": 16,
            "component-emitter": 9
        }],
        16: [function(require, module, exports) {
            module.exports.create = function() {
                function F() {}
                return function(o) {
                    if (arguments.length != 1) {
                        throw new Error("Object.create implementation only accepts one parameter.")
                    }
                    F.prototype = o;
                    return new F
                }
            }()
        }
        , {}],
        17: [function(require, module, exports) {
            var cycle = require("cycle");
            var isStrict = function() {
                return !this
            }();
            function AuthTokenExpiredError(message, expiry) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "AuthTokenExpiredError";
                this.message = message;
                this.expiry = expiry
            }
            AuthTokenExpiredError.prototype = Object.create(Error.prototype);
            function AuthTokenInvalidError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "AuthTokenInvalidError";
                this.message = message
            }
            AuthTokenInvalidError.prototype = Object.create(Error.prototype);
            function SilentMiddlewareBlockedError(message, type) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "SilentMiddlewareBlockedError";
                this.message = message;
                this.type = type
            }
            SilentMiddlewareBlockedError.prototype = Object.create(Error.prototype);
            function InvalidActionError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "InvalidActionError";
                this.message = message
            }
            InvalidActionError.prototype = Object.create(Error.prototype);
            function InvalidArgumentsError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "InvalidArgumentsError";
                this.message = message
            }
            InvalidArgumentsError.prototype = Object.create(Error.prototype);
            function InvalidOptionsError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "InvalidOptionsError";
                this.message = message
            }
            InvalidOptionsError.prototype = Object.create(Error.prototype);
            function InvalidMessageError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "InvalidMessageError";
                this.message = message
            }
            InvalidMessageError.prototype = Object.create(Error.prototype);
            function SocketProtocolError(message, code) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "SocketProtocolError";
                this.message = message;
                this.code = code
            }
            SocketProtocolError.prototype = Object.create(Error.prototype);
            function ServerProtocolError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "ServerProtocolError";
                this.message = message
            }
            ServerProtocolError.prototype = Object.create(Error.prototype);
            function HTTPServerError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "HTTPServerError";
                this.message = message
            }
            HTTPServerError.prototype = Object.create(Error.prototype);
            function ResourceLimitError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "ResourceLimitError";
                this.message = message
            }
            ResourceLimitError.prototype = Object.create(Error.prototype);
            function TimeoutError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "TimeoutError";
                this.message = message
            }
            TimeoutError.prototype = Object.create(Error.prototype);
            function BrokerError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "BrokerError";
                this.message = message
            }
            BrokerError.prototype = Object.create(Error.prototype);
            function ProcessExitError(message, code) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "ProcessExitError";
                this.message = message;
                this.code = code
            }
            ProcessExitError.prototype = Object.create(Error.prototype);
            function UnknownError(message) {
                if (Error.captureStackTrace && !isStrict) {
                    Error.captureStackTrace(this, arguments.callee)
                } else {
                    this.stack = (new Error).stack
                }
                this.name = "UnknownError";
                this.message = message
            }
            UnknownError.prototype = Object.create(Error.prototype);
            module.exports = {
                AuthTokenExpiredError: AuthTokenExpiredError,
                AuthTokenInvalidError: AuthTokenInvalidError,
                SilentMiddlewareBlockedError: SilentMiddlewareBlockedError,
                InvalidActionError: InvalidActionError,
                InvalidArgumentsError: InvalidArgumentsError,
                InvalidOptionsError: InvalidOptionsError,
                InvalidMessageError: InvalidMessageError,
                SocketProtocolError: SocketProtocolError,
                ServerProtocolError: ServerProtocolError,
                HTTPServerError: HTTPServerError,
                ResourceLimitError: ResourceLimitError,
                TimeoutError: TimeoutError,
                BrokerError: BrokerError,
                ProcessExitError: ProcessExitError,
                UnknownError: UnknownError
            };
            module.exports.socketProtocolErrorStatuses = {
                1001: "Socket was disconnected",
                1002: "A WebSocket protocol error was encountered",
                1003: "Server terminated socket because it received invalid data",
                1005: "Socket closed without status code",
                1006: "Socket hung up",
                1007: "Message format was incorrect",
                1008: "Encountered a policy violation",
                1009: "Message was too big to process",
                1010: "Client ended the connection because the server did not comply with extension requirements",
                1011: "Server encountered an unexpected fatal condition",
                4e3: "Server ping timed out",
                4001: "Client pong timed out",
                4002: "Server failed to sign auth token",
                4003: "Failed to complete handshake",
                4004: "Client failed to save auth token",
                4005: "Did not receive #handshake from client before timeout",
                4006: "Failed to bind socket to message broker",
                4007: "Client connection establishment timed out"
            };
            module.exports.socketProtocolIgnoreStatuses = {
                1e3: "Socket closed normally",
                1001: "Socket hung up"
            };
            var unserializableErrorProperties = {
                domain: 1,
                domainEmitter: 1,
                domainThrown: 1
            };
            module.exports.dehydrateError = function(error, includeStackTrace) {
                var dehydratedError;
                if (!error || typeof error == "string") {
                    dehydratedError = error
                } else {
                    dehydratedError = {
                        message: error.message
                    };
                    if (includeStackTrace) {
                        dehydratedError.stack = error.stack
                    }
                    for (var i in error) {
                        if (!unserializableErrorProperties[i]) {
                            dehydratedError[i] = error[i]
                        }
                    }
                }
                return cycle.decycle(dehydratedError)
            }
            ;
            module.exports.hydrateError = function(error) {
                var hydratedError = null;
                if (error != null) {
                    if (typeof error == "string") {
                        hydratedError = error
                    } else {
                        hydratedError = new Error(error.message);
                        for (var i in error) {
                            if (error.hasOwnProperty(i)) {
                                hydratedError[i] = error[i]
                            }
                        }
                    }
                }
                return hydratedError
            }
        }
        , {
            cycle: 10
        }],
        18: [function(require, module, exports) {
            (function(global) {
                var base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                var arrayBufferToBase64 = function(arraybuffer) {
                    var bytes = new Uint8Array(arraybuffer);
                    var len = bytes.length;
                    var base64 = "";
                    for (var i = 0; i < len; i += 3) {
                        base64 += base64Chars[bytes[i] >> 2];
                        base64 += base64Chars[(bytes[i] & 3) << 4 | bytes[i + 1] >> 4];
                        base64 += base64Chars[(bytes[i + 1] & 15) << 2 | bytes[i + 2] >> 6];
                        base64 += base64Chars[bytes[i + 2] & 63]
                    }
                    if (len % 3 === 2) {
                        base64 = base64.substring(0, base64.length - 1) + "="
                    } else if (len % 3 === 1) {
                        base64 = base64.substring(0, base64.length - 2) + "=="
                    }
                    return base64
                };
                var binaryToBase64Replacer = function(key, value) {
                    if (global.ArrayBuffer && value instanceof global.ArrayBuffer) {
                        return {
                            base64: true,
                            data: arrayBufferToBase64(value)
                        }
                    } else if (global.Buffer) {
                        if (value instanceof global.Buffer) {
                            return {
                                base64: true,
                                data: value.toString("base64")
                            }
                        }
                        if (value && value.type == "Buffer" && value.data instanceof Array) {
                            var rehydratedBuffer;
                            if (global.Buffer.from) {
                                rehydratedBuffer = global.Buffer.from(value.data)
                            } else {
                                rehydratedBuffer = new global.Buffer(value.data)
                            }
                            return {
                                base64: true,
                                data: rehydratedBuffer.toString("base64")
                            }
                        }
                    }
                    return value
                };
                module.exports.decode = function(input) {
                    if (input == null) {
                        return null
                    }
                    if (input == "#1" || input == "#2") {
                        return input
                    }
                    var message = input.toString();
                    try {
                        return JSON.parse(message)
                    } catch (err) {}
                    return message
                }
                ;
                module.exports.encode = function(object) {
                    if (object == "#1" || object == "#2") {
                        return object
                    }
                    return JSON.stringify(object, binaryToBase64Replacer)
                }
            }
            ).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }
        , {}],
        19: [function(require, module, exports) {
            "use strict";
            exports.byteLength = byteLength;
            exports.toByteArray = toByteArray;
            exports.fromByteArray = fromByteArray;
            var lookup = [];
            var revLookup = [];
            var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
            var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            for (var i = 0, len = code.length; i < len; ++i) {
                lookup[i] = code[i];
                revLookup[code.charCodeAt(i)] = i
            }
            revLookup["-".charCodeAt(0)] = 62;
            revLookup["_".charCodeAt(0)] = 63;
            function placeHoldersCount(b64) {
                var len = b64.length;
                if (len % 4 > 0) {
                    throw new Error("Invalid string. Length must be a multiple of 4")
                }
                return b64[len - 2] === "=" ? 2 : b64[len - 1] === "=" ? 1 : 0
            }
            function byteLength(b64) {
                return b64.length * 3 / 4 - placeHoldersCount(b64)
            }
            function toByteArray(b64) {
                var i, j, l, tmp, placeHolders, arr;
                var len = b64.length;
                placeHolders = placeHoldersCount(b64);
                arr = new Arr(len * 3 / 4 - placeHolders);
                l = placeHolders > 0 ? len - 4 : len;
                var L = 0;
                for (i = 0,
                j = 0; i < l; i += 4,
                j += 3) {
                    tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
                    arr[L++] = tmp >> 16 & 255;
                    arr[L++] = tmp >> 8 & 255;
                    arr[L++] = tmp & 255
                }
                if (placeHolders === 2) {
                    tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
                    arr[L++] = tmp & 255
                } else if (placeHolders === 1) {
                    tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
                    arr[L++] = tmp >> 8 & 255;
                    arr[L++] = tmp & 255
                }
                return arr
            }
            function tripletToBase64(num) {
                return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63]
            }
            function encodeChunk(uint8, start, end) {
                var tmp;
                var output = [];
                for (var i = start; i < end; i += 3) {
                    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + uint8[i + 2];
                    output.push(tripletToBase64(tmp))
                }
                return output.join("")
            }
            function fromByteArray(uint8) {
                var tmp;
                var len = uint8.length;
                var extraBytes = len % 3;
                var output = "";
                var parts = [];
                var maxChunkLength = 16383;
                for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
                    parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength))
                }
                if (extraBytes === 1) {
                    tmp = uint8[len - 1];
                    output += lookup[tmp >> 2];
                    output += lookup[tmp << 4 & 63];
                    output += "=="
                } else if (extraBytes === 2) {
                    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
                    output += lookup[tmp >> 10];
                    output += lookup[tmp >> 4 & 63];
                    output += lookup[tmp << 2 & 63];
                    output += "="
                }
                parts.push(output);
                return parts.join("")
            }
        }
        , {}],
        20: [function(require, module, exports) {
            "use strict";
            var base64 = require("base64-js");
            var ieee754 = require("ieee754");
            exports.Buffer = Buffer;
            exports.SlowBuffer = SlowBuffer;
            exports.INSPECT_MAX_BYTES = 50;
            var K_MAX_LENGTH = 2147483647;
            exports.kMaxLength = K_MAX_LENGTH;
            Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();
            if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
                console.error("This browser lacks typed array (Uint8Array) support which is required by " + "`buffer` v5.x. Use `buffer` v4.x if you require old browser support.")
            }
            function typedArraySupport() {
                try {
                    var arr = new Uint8Array(1);
                    arr.__proto__ = {
                        __proto__: Uint8Array.prototype,
                        foo: function() {
                            return 42
                        }
                    };
                    return arr.foo() === 42
                } catch (e) {
                    return false
                }
            }
            function createBuffer(length) {
                if (length > K_MAX_LENGTH) {
                    throw new RangeError("Invalid typed array length")
                }
                var buf = new Uint8Array(length);
                buf.__proto__ = Buffer.prototype;
                return buf
            }
            function Buffer(arg, encodingOrOffset, length) {
                if (typeof arg === "number") {
                    if (typeof encodingOrOffset === "string") {
                        throw new Error("If encoding is specified then the first argument must be a string")
                    }
                    return allocUnsafe(arg)
                }
                return from(arg, encodingOrOffset, length)
            }
            if (typeof Symbol !== "undefined" && Symbol.species && Buffer[Symbol.species] === Buffer) {
                Object.defineProperty(Buffer, Symbol.species, {
                    value: null,
                    configurable: true,
                    enumerable: false,
                    writable: false
                })
            }
            Buffer.poolSize = 8192;
            function from(value, encodingOrOffset, length) {
                if (typeof value === "number") {
                    throw new TypeError('"value" argument must not be a number')
                }
                if (value instanceof ArrayBuffer) {
                    return fromArrayBuffer(value, encodingOrOffset, length)
                }
                if (typeof value === "string") {
                    return fromString(value, encodingOrOffset)
                }
                return fromObject(value)
            }
            Buffer.from = function(value, encodingOrOffset, length) {
                return from(value, encodingOrOffset, length)
            }
            ;
            Buffer.prototype.__proto__ = Uint8Array.prototype;
            Buffer.__proto__ = Uint8Array;
            function assertSize(size) {
                if (typeof size !== "number") {
                    throw new TypeError('"size" argument must be a number')
                } else if (size < 0) {
                    throw new RangeError('"size" argument must not be negative')
                }
            }
            function alloc(size, fill, encoding) {
                assertSize(size);
                if (size <= 0) {
                    return createBuffer(size)
                }
                if (fill !== undefined) {
                    return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill)
                }
                return createBuffer(size)
            }
            Buffer.alloc = function(size, fill, encoding) {
                return alloc(size, fill, encoding)
            }
            ;
            function allocUnsafe(size) {
                assertSize(size);
                return createBuffer(size < 0 ? 0 : checked(size) | 0)
            }
            Buffer.allocUnsafe = function(size) {
                return allocUnsafe(size)
            }
            ;
            Buffer.allocUnsafeSlow = function(size) {
                return allocUnsafe(size)
            }
            ;
            function fromString(string, encoding) {
                if (typeof encoding !== "string" || encoding === "") {
                    encoding = "utf8"
                }
                if (!Buffer.isEncoding(encoding)) {
                    throw new TypeError('"encoding" must be a valid string encoding')
                }
                var length = byteLength(string, encoding) | 0;
                var buf = createBuffer(length);
                var actual = buf.write(string, encoding);
                if (actual !== length) {
                    buf = buf.slice(0, actual)
                }
                return buf
            }
            function fromArrayLike(array) {
                var length = array.length < 0 ? 0 : checked(array.length) | 0;
                var buf = createBuffer(length);
                for (var i = 0; i < length; i += 1) {
                    buf[i] = array[i] & 255
                }
                return buf
            }
            function fromArrayBuffer(array, byteOffset, length) {
                if (byteOffset < 0 || array.byteLength < byteOffset) {
                    throw new RangeError("'offset' is out of bounds")
                }
                if (array.byteLength < byteOffset + (length || 0)) {
                    throw new RangeError("'length' is out of bounds")
                }
                var buf;
                if (byteOffset === undefined && length === undefined) {
                    buf = new Uint8Array(array)
                } else if (length === undefined) {
                    buf = new Uint8Array(array,byteOffset)
                } else {
                    buf = new Uint8Array(array,byteOffset,length)
                }
                buf.__proto__ = Buffer.prototype;
                return buf
            }
            function fromObject(obj) {
                if (Buffer.isBuffer(obj)) {
                    var len = checked(obj.length) | 0;
                    var buf = createBuffer(len);
                    if (buf.length === 0) {
                        return buf
                    }
                    obj.copy(buf, 0, 0, len);
                    return buf
                }
                if (obj) {
                    if (ArrayBuffer.isView(obj) || "length"in obj) {
                        if (typeof obj.length !== "number" || isnan(obj.length)) {
                            return createBuffer(0)
                        }
                        return fromArrayLike(obj)
                    }
                    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
                        return fromArrayLike(obj.data)
                    }
                }
                throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.")
            }
            function checked(length) {
                if (length >= K_MAX_LENGTH) {
                    throw new RangeError("Attempt to allocate Buffer larger than maximum " + "size: 0x" + K_MAX_LENGTH.toString(16) + " bytes")
                }
                return length | 0
            }
            function SlowBuffer(length) {
                if (+length != length) {
                    length = 0
                }
                return Buffer.alloc(+length)
            }
            Buffer.isBuffer = function isBuffer(b) {
                return b != null && b._isBuffer === true
            }
            ;
            Buffer.compare = function compare(a, b) {
                if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
                    throw new TypeError("Arguments must be Buffers")
                }
                if (a === b)
                    return 0;
                var x = a.length;
                var y = b.length;
                for (var i = 0, len = Math.min(x, y); i < len; ++i) {
                    if (a[i] !== b[i]) {
                        x = a[i];
                        y = b[i];
                        break
                    }
                }
                if (x < y)
                    return -1;
                if (y < x)
                    return 1;
                return 0
            }
            ;
            Buffer.isEncoding = function isEncoding(encoding) {
                switch (String(encoding).toLowerCase()) {
                case "hex":
                case "utf8":
                case "utf-8":
                case "ascii":
                case "latin1":
                case "binary":
                case "base64":
                case "ucs2":
                case "ucs-2":
                case "utf16le":
                case "utf-16le":
                    return true;
                default:
                    return false
                }
            }
            ;
            Buffer.concat = function concat(list, length) {
                if (!Array.isArray(list)) {
                    throw new TypeError('"list" argument must be an Array of Buffers')
                }
                if (list.length === 0) {
                    return Buffer.alloc(0)
                }
                var i;
                if (length === undefined) {
                    length = 0;
                    for (i = 0; i < list.length; ++i) {
                        length += list[i].length
                    }
                }
                var buffer = Buffer.allocUnsafe(length);
                var pos = 0;
                for (i = 0; i < list.length; ++i) {
                    var buf = list[i];
                    if (!Buffer.isBuffer(buf)) {
                        throw new TypeError('"list" argument must be an Array of Buffers')
                    }
                    buf.copy(buffer, pos);
                    pos += buf.length
                }
                return buffer
            }
            ;
            function byteLength(string, encoding) {
                if (Buffer.isBuffer(string)) {
                    return string.length
                }
                if (ArrayBuffer.isView(string) || string instanceof ArrayBuffer) {
                    return string.byteLength
                }
                if (typeof string !== "string") {
                    string = "" + string
                }
                var len = string.length;
                if (len === 0)
                    return 0;
                var loweredCase = false;
                for (; ; ) {
                    switch (encoding) {
                    case "ascii":
                    case "latin1":
                    case "binary":
                        return len;
                    case "utf8":
                    case "utf-8":
                    case undefined:
                        return utf8ToBytes(string).length;
                    case "ucs2":
                    case "ucs-2":
                    case "utf16le":
                    case "utf-16le":
                        return len * 2;
                    case "hex":
                        return len >>> 1;
                    case "base64":
                        return base64ToBytes(string).length;
                    default:
                        if (loweredCase)
                            return utf8ToBytes(string).length;
                        encoding = ("" + encoding).toLowerCase();
                        loweredCase = true
                    }
                }
            }
            Buffer.byteLength = byteLength;
            function slowToString(encoding, start, end) {
                var loweredCase = false;
                if (start === undefined || start < 0) {
                    start = 0
                }
                if (start > this.length) {
                    return ""
                }
                if (end === undefined || end > this.length) {
                    end = this.length
                }
                if (end <= 0) {
                    return ""
                }
                end >>>= 0;
                start >>>= 0;
                if (end <= start) {
                    return ""
                }
                if (!encoding)
                    encoding = "utf8";
                while (true) {
                    switch (encoding) {
                    case "hex":
                        return hexSlice(this, start, end);
                    case "utf8":
                    case "utf-8":
                        return utf8Slice(this, start, end);
                    case "ascii":
                        return asciiSlice(this, start, end);
                    case "latin1":
                    case "binary":
                        return latin1Slice(this, start, end);
                    case "base64":
                        return base64Slice(this, start, end);
                    case "ucs2":
                    case "ucs-2":
                    case "utf16le":
                    case "utf-16le":
                        return utf16leSlice(this, start, end);
                    default:
                        if (loweredCase)
                            throw new TypeError("Unknown encoding: " + encoding);
                        encoding = (encoding + "").toLowerCase();
                        loweredCase = true
                    }
                }
            }
            Buffer.prototype._isBuffer = true;
            function swap(b, n, m) {
                var i = b[n];
                b[n] = b[m];
                b[m] = i
            }
            Buffer.prototype.swap16 = function swap16() {
                var len = this.length;
                if (len % 2 !== 0) {
                    throw new RangeError("Buffer size must be a multiple of 16-bits")
                }
                for (var i = 0; i < len; i += 2) {
                    swap(this, i, i + 1)
                }
                return this
            }
            ;
            Buffer.prototype.swap32 = function swap32() {
                var len = this.length;
                if (len % 4 !== 0) {
                    throw new RangeError("Buffer size must be a multiple of 32-bits")
                }
                for (var i = 0; i < len; i += 4) {
                    swap(this, i, i + 3);
                    swap(this, i + 1, i + 2)
                }
                return this
            }
            ;
            Buffer.prototype.swap64 = function swap64() {
                var len = this.length;
                if (len % 8 !== 0) {
                    throw new RangeError("Buffer size must be a multiple of 64-bits")
                }
                for (var i = 0; i < len; i += 8) {
                    swap(this, i, i + 7);
                    swap(this, i + 1, i + 6);
                    swap(this, i + 2, i + 5);
                    swap(this, i + 3, i + 4)
                }
                return this
            }
            ;
            Buffer.prototype.toString = function toString() {
                var length = this.length;
                if (length === 0)
                    return "";
                if (arguments.length === 0)
                    return utf8Slice(this, 0, length);
                return slowToString.apply(this, arguments)
            }
            ;
            Buffer.prototype.equals = function equals(b) {
                if (!Buffer.isBuffer(b))
                    throw new TypeError("Argument must be a Buffer");
                if (this === b)
                    return true;
                return Buffer.compare(this, b) === 0
            }
            ;
            Buffer.prototype.inspect = function inspect() {
                var str = "";
                var max = exports.INSPECT_MAX_BYTES;
                if (this.length > 0) {
                    str = this.toString("hex", 0, max).match(/.{2}/g).join(" ");
                    if (this.length > max)
                        str += " ... "
                }
                return "<Buffer " + str + ">"
            }
            ;
            Buffer.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
                if (!Buffer.isBuffer(target)) {
                    throw new TypeError("Argument must be a Buffer")
                }
                if (start === undefined) {
                    start = 0
                }
                if (end === undefined) {
                    end = target ? target.length : 0
                }
                if (thisStart === undefined) {
                    thisStart = 0
                }
                if (thisEnd === undefined) {
                    thisEnd = this.length
                }
                if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
                    throw new RangeError("out of range index")
                }
                if (thisStart >= thisEnd && start >= end) {
                    return 0
                }
                if (thisStart >= thisEnd) {
                    return -1
                }
                if (start >= end) {
                    return 1
                }
                start >>>= 0;
                end >>>= 0;
                thisStart >>>= 0;
                thisEnd >>>= 0;
                if (this === target)
                    return 0;
                var x = thisEnd - thisStart;
                var y = end - start;
                var len = Math.min(x, y);
                var thisCopy = this.slice(thisStart, thisEnd);
                var targetCopy = target.slice(start, end);
                for (var i = 0; i < len; ++i) {
                    if (thisCopy[i] !== targetCopy[i]) {
                        x = thisCopy[i];
                        y = targetCopy[i];
                        break
                    }
                }
                if (x < y)
                    return -1;
                if (y < x)
                    return 1;
                return 0
            }
            ;
            function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
                if (buffer.length === 0)
                    return -1;
                if (typeof byteOffset === "string") {
                    encoding = byteOffset;
                    byteOffset = 0
                } else if (byteOffset > 2147483647) {
                    byteOffset = 2147483647
                } else if (byteOffset < -2147483648) {
                    byteOffset = -2147483648
                }
                byteOffset = +byteOffset;
                if (isNaN(byteOffset)) {
                    byteOffset = dir ? 0 : buffer.length - 1
                }
                if (byteOffset < 0)
                    byteOffset = buffer.length + byteOffset;
                if (byteOffset >= buffer.length) {
                    if (dir)
                        return -1;
                    else
                        byteOffset = buffer.length - 1
                } else if (byteOffset < 0) {
                    if (dir)
                        byteOffset = 0;
                    else
                        return -1
                }
                if (typeof val === "string") {
                    val = Buffer.from(val, encoding)
                }
                if (Buffer.isBuffer(val)) {
                    if (val.length === 0) {
                        return -1
                    }
                    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
                } else if (typeof val === "number") {
                    val = val & 255;
                    if (typeof Uint8Array.prototype.indexOf === "function") {
                        if (dir) {
                            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
                        } else {
                            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
                        }
                    }
                    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
                }
                throw new TypeError("val must be string, number or Buffer")
            }
            function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
                var indexSize = 1;
                var arrLength = arr.length;
                var valLength = val.length;
                if (encoding !== undefined) {
                    encoding = String(encoding).toLowerCase();
                    if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
                        if (arr.length < 2 || val.length < 2) {
                            return -1
                        }
                        indexSize = 2;
                        arrLength /= 2;
                        valLength /= 2;
                        byteOffset /= 2
                    }
                }
                function read(buf, i) {
                    if (indexSize === 1) {
                        return buf[i]
                    } else {
                        return buf.readUInt16BE(i * indexSize)
                    }
                }
                var i;
                if (dir) {
                    var foundIndex = -1;
                    for (i = byteOffset; i < arrLength; i++) {
                        if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
                            if (foundIndex === -1)
                                foundIndex = i;
                            if (i - foundIndex + 1 === valLength)
                                return foundIndex * indexSize
                        } else {
                            if (foundIndex !== -1)
                                i -= i - foundIndex;
                            foundIndex = -1
                        }
                    }
                } else {
                    if (byteOffset + valLength > arrLength)
                        byteOffset = arrLength - valLength;
                    for (i = byteOffset; i >= 0; i--) {
                        var found = true;
                        for (var j = 0; j < valLength; j++) {
                            if (read(arr, i + j) !== read(val, j)) {
                                found = false;
                                break
                            }
                        }
                        if (found)
                            return i
                    }
                }
                return -1
            }
            Buffer.prototype.includes = function includes(val, byteOffset, encoding) {
                return this.indexOf(val, byteOffset, encoding) !== -1
            }
            ;
            Buffer.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
                return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
            }
            ;
            Buffer.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
                return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
            }
            ;
            function hexWrite(buf, string, offset, length) {
                offset = Number(offset) || 0;
                var remaining = buf.length - offset;
                if (!length) {
                    length = remaining
                } else {
                    length = Number(length);
                    if (length > remaining) {
                        length = remaining
                    }
                }
                var strLen = string.length;
                if (strLen % 2 !== 0)
                    throw new TypeError("Invalid hex string");
                if (length > strLen / 2) {
                    length = strLen / 2
                }
                for (var i = 0; i < length; ++i) {
                    var parsed = parseInt(string.substr(i * 2, 2), 16);
                    if (isNaN(parsed))
                        return i;
                    buf[offset + i] = parsed
                }
                return i
            }
            function utf8Write(buf, string, offset, length) {
                return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
            }
            function asciiWrite(buf, string, offset, length) {
                return blitBuffer(asciiToBytes(string), buf, offset, length)
            }
            function latin1Write(buf, string, offset, length) {
                return asciiWrite(buf, string, offset, length)
            }
            function base64Write(buf, string, offset, length) {
                return blitBuffer(base64ToBytes(string), buf, offset, length)
            }
            function ucs2Write(buf, string, offset, length) {
                return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
            }
            Buffer.prototype.write = function write(string, offset, length, encoding) {
                if (offset === undefined) {
                    encoding = "utf8";
                    length = this.length;
                    offset = 0
                } else if (length === undefined && typeof offset === "string") {
                    encoding = offset;
                    length = this.length;
                    offset = 0
                } else if (isFinite(offset)) {
                    offset = offset >>> 0;
                    if (isFinite(length)) {
                        length = length >>> 0;
                        if (encoding === undefined)
                            encoding = "utf8"
                    } else {
                        encoding = length;
                        length = undefined
                    }
                } else {
                    throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported")
                }
                var remaining = this.length - offset;
                if (length === undefined || length > remaining)
                    length = remaining;
                if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
                    throw new RangeError("Attempt to write outside buffer bounds")
                }
                if (!encoding)
                    encoding = "utf8";
                var loweredCase = false;
                for (; ; ) {
                    switch (encoding) {
                    case "hex":
                        return hexWrite(this, string, offset, length);
                    case "utf8":
                    case "utf-8":
                        return utf8Write(this, string, offset, length);
                    case "ascii":
                        return asciiWrite(this, string, offset, length);
                    case "latin1":
                    case "binary":
                        return latin1Write(this, string, offset, length);
                    case "base64":
                        return base64Write(this, string, offset, length);
                    case "ucs2":
                    case "ucs-2":
                    case "utf16le":
                    case "utf-16le":
                        return ucs2Write(this, string, offset, length);
                    default:
                        if (loweredCase)
                            throw new TypeError("Unknown encoding: " + encoding);
                        encoding = ("" + encoding).toLowerCase();
                        loweredCase = true
                    }
                }
            }
            ;
            Buffer.prototype.toJSON = function toJSON() {
                return {
                    type: "Buffer",
                    data: Array.prototype.slice.call(this._arr || this, 0)
                }
            }
            ;
            function base64Slice(buf, start, end) {
                if (start === 0 && end === buf.length) {
                    return base64.fromByteArray(buf)
                } else {
                    return base64.fromByteArray(buf.slice(start, end))
                }
            }
            function utf8Slice(buf, start, end) {
                end = Math.min(buf.length, end);
                var res = [];
                var i = start;
                while (i < end) {
                    var firstByte = buf[i];
                    var codePoint = null;
                    var bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
                    if (i + bytesPerSequence <= end) {
                        var secondByte, thirdByte, fourthByte, tempCodePoint;
                        switch (bytesPerSequence) {
                        case 1:
                            if (firstByte < 128) {
                                codePoint = firstByte
                            }
                            break;
                        case 2:
                            secondByte = buf[i + 1];
                            if ((secondByte & 192) === 128) {
                                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                                if (tempCodePoint > 127) {
                                    codePoint = tempCodePoint
                                }
                            }
                            break;
                        case 3:
                            secondByte = buf[i + 1];
                            thirdByte = buf[i + 2];
                            if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                                    codePoint = tempCodePoint
                                }
                            }
                            break;
                        case 4:
                            secondByte = buf[i + 1];
                            thirdByte = buf[i + 2];
                            fourthByte = buf[i + 3];
                            if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                                    codePoint = tempCodePoint
                                }
                            }
                        }
                    }
                    if (codePoint === null) {
                        codePoint = 65533;
                        bytesPerSequence = 1
                    } else if (codePoint > 65535) {
                        codePoint -= 65536;
                        res.push(codePoint >>> 10 & 1023 | 55296);
                        codePoint = 56320 | codePoint & 1023
                    }
                    res.push(codePoint);
                    i += bytesPerSequence
                }
                return decodeCodePointsArray(res)
            }
            var MAX_ARGUMENTS_LENGTH = 4096;
            function decodeCodePointsArray(codePoints) {
                var len = codePoints.length;
                if (len <= MAX_ARGUMENTS_LENGTH) {
                    return String.fromCharCode.apply(String, codePoints)
                }
                var res = "";
                var i = 0;
                while (i < len) {
                    res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH))
                }
                return res
            }
            function asciiSlice(buf, start, end) {
                var ret = "";
                end = Math.min(buf.length, end);
                for (var i = start; i < end; ++i) {
                    ret += String.fromCharCode(buf[i] & 127)
                }
                return ret
            }
            function latin1Slice(buf, start, end) {
                var ret = "";
                end = Math.min(buf.length, end);
                for (var i = start; i < end; ++i) {
                    ret += String.fromCharCode(buf[i])
                }
                return ret
            }
            function hexSlice(buf, start, end) {
                var len = buf.length;
                if (!start || start < 0)
                    start = 0;
                if (!end || end < 0 || end > len)
                    end = len;
                var out = "";
                for (var i = start; i < end; ++i) {
                    out += toHex(buf[i])
                }
                return out
            }
            function utf16leSlice(buf, start, end) {
                var bytes = buf.slice(start, end);
                var res = "";
                for (var i = 0; i < bytes.length; i += 2) {
                    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
                }
                return res
            }
            Buffer.prototype.slice = function slice(start, end) {
                var len = this.length;
                start = ~~start;
                end = end === undefined ? len : ~~end;
                if (start < 0) {
                    start += len;
                    if (start < 0)
                        start = 0
                } else if (start > len) {
                    start = len
                }
                if (end < 0) {
                    end += len;
                    if (end < 0)
                        end = 0
                } else if (end > len) {
                    end = len
                }
                if (end < start)
                    end = start;
                var newBuf = this.subarray(start, end);
                newBuf.__proto__ = Buffer.prototype;
                return newBuf
            }
            ;
            function checkOffset(offset, ext, length) {
                if (offset % 1 !== 0 || offset < 0)
                    throw new RangeError("offset is not uint");
                if (offset + ext > length)
                    throw new RangeError("Trying to access beyond buffer length")
            }
            Buffer.prototype.readUIntLE = function readUIntLE(offset, byteLength, noAssert) {
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert)
                    checkOffset(offset, byteLength, this.length);
                var val = this[offset];
                var mul = 1;
                var i = 0;
                while (++i < byteLength && (mul *= 256)) {
                    val += this[offset + i] * mul
                }
                return val
            }
            ;
            Buffer.prototype.readUIntBE = function readUIntBE(offset, byteLength, noAssert) {
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert) {
                    checkOffset(offset, byteLength, this.length)
                }
                var val = this[offset + --byteLength];
                var mul = 1;
                while (byteLength > 0 && (mul *= 256)) {
                    val += this[offset + --byteLength] * mul
                }
                return val
            }
            ;
            Buffer.prototype.readUInt8 = function readUInt8(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 1, this.length);
                return this[offset]
            }
            ;
            Buffer.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 2, this.length);
                return this[offset] | this[offset + 1] << 8
            }
            ;
            Buffer.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 2, this.length);
                return this[offset] << 8 | this[offset + 1]
            }
            ;
            Buffer.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216
            }
            ;
            Buffer.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3])
            }
            ;
            Buffer.prototype.readIntLE = function readIntLE(offset, byteLength, noAssert) {
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert)
                    checkOffset(offset, byteLength, this.length);
                var val = this[offset];
                var mul = 1;
                var i = 0;
                while (++i < byteLength && (mul *= 256)) {
                    val += this[offset + i] * mul
                }
                mul *= 128;
                if (val >= mul)
                    val -= Math.pow(2, 8 * byteLength);
                return val
            }
            ;
            Buffer.prototype.readIntBE = function readIntBE(offset, byteLength, noAssert) {
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert)
                    checkOffset(offset, byteLength, this.length);
                var i = byteLength;
                var mul = 1;
                var val = this[offset + --i];
                while (i > 0 && (mul *= 256)) {
                    val += this[offset + --i] * mul
                }
                mul *= 128;
                if (val >= mul)
                    val -= Math.pow(2, 8 * byteLength);
                return val
            }
            ;
            Buffer.prototype.readInt8 = function readInt8(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 1, this.length);
                if (!(this[offset] & 128))
                    return this[offset];
                return (255 - this[offset] + 1) * -1
            }
            ;
            Buffer.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 2, this.length);
                var val = this[offset] | this[offset + 1] << 8;
                return val & 32768 ? val | 4294901760 : val
            }
            ;
            Buffer.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 2, this.length);
                var val = this[offset + 1] | this[offset] << 8;
                return val & 32768 ? val | 4294901760 : val
            }
            ;
            Buffer.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24
            }
            ;
            Buffer.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]
            }
            ;
            Buffer.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return ieee754.read(this, offset, true, 23, 4)
            }
            ;
            Buffer.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 4, this.length);
                return ieee754.read(this, offset, false, 23, 4)
            }
            ;
            Buffer.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 8, this.length);
                return ieee754.read(this, offset, true, 52, 8)
            }
            ;
            Buffer.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
                offset = offset >>> 0;
                if (!noAssert)
                    checkOffset(offset, 8, this.length);
                return ieee754.read(this, offset, false, 52, 8)
            }
            ;
            function checkInt(buf, value, offset, ext, max, min) {
                if (!Buffer.isBuffer(buf))
                    throw new TypeError('"buffer" argument must be a Buffer instance');
                if (value > max || value < min)
                    throw new RangeError('"value" argument is out of bounds');
                if (offset + ext > buf.length)
                    throw new RangeError("Index out of range")
            }
            Buffer.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength, noAssert) {
                value = +value;
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert) {
                    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
                    checkInt(this, value, offset, byteLength, maxBytes, 0)
                }
                var mul = 1;
                var i = 0;
                this[offset] = value & 255;
                while (++i < byteLength && (mul *= 256)) {
                    this[offset + i] = value / mul & 255
                }
                return offset + byteLength
            }
            ;
            Buffer.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength, noAssert) {
                value = +value;
                offset = offset >>> 0;
                byteLength = byteLength >>> 0;
                if (!noAssert) {
                    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
                    checkInt(this, value, offset, byteLength, maxBytes, 0)
                }
                var i = byteLength - 1;
                var mul = 1;
                this[offset + i] = value & 255;
                while (--i >= 0 && (mul *= 256)) {
                    this[offset + i] = value / mul & 255
                }
                return offset + byteLength
            }
            ;
            Buffer.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 1, 255, 0);
                this[offset] = value & 255;
                return offset + 1
            }
            ;
            Buffer.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 2, 65535, 0);
                this[offset] = value & 255;
                this[offset + 1] = value >>> 8;
                return offset + 2
            }
            ;
            Buffer.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 2, 65535, 0);
                this[offset] = value >>> 8;
                this[offset + 1] = value & 255;
                return offset + 2
            }
            ;
            Buffer.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 4, 4294967295, 0);
                this[offset + 3] = value >>> 24;
                this[offset + 2] = value >>> 16;
                this[offset + 1] = value >>> 8;
                this[offset] = value & 255;
                return offset + 4
            }
            ;
            Buffer.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 4, 4294967295, 0);
                this[offset] = value >>> 24;
                this[offset + 1] = value >>> 16;
                this[offset + 2] = value >>> 8;
                this[offset + 3] = value & 255;
                return offset + 4
            }
            ;
            Buffer.prototype.writeIntLE = function writeIntLE(value, offset, byteLength, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert) {
                    var limit = Math.pow(2, 8 * byteLength - 1);
                    checkInt(this, value, offset, byteLength, limit - 1, -limit)
                }
                var i = 0;
                var mul = 1;
                var sub = 0;
                this[offset] = value & 255;
                while (++i < byteLength && (mul *= 256)) {
                    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
                        sub = 1
                    }
                    this[offset + i] = (value / mul >> 0) - sub & 255;

                }
                return offset + byteLength
            }
            ;
            Buffer.prototype.writeIntBE = function writeIntBE(value, offset, byteLength, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert) {
                    var limit = Math.pow(2, 8 * byteLength - 1);
                    checkInt(this, value, offset, byteLength, limit - 1, -limit)
                }
                var i = byteLength - 1;
                var mul = 1;
                var sub = 0;
                this[offset + i] = value & 255;
                while (--i >= 0 && (mul *= 256)) {
                    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
                        sub = 1
                    }
                    this[offset + i] = (value / mul >> 0) - sub & 255
                }
                return offset + byteLength
            }
            ;
            Buffer.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 1, 127, -128);
                if (value < 0)
                    value = 255 + value + 1;
                this[offset] = value & 255;
                return offset + 1
            }
            ;
            Buffer.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 2, 32767, -32768);
                this[offset] = value & 255;
                this[offset + 1] = value >>> 8;
                return offset + 2
            }
            ;
            Buffer.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 2, 32767, -32768);
                this[offset] = value >>> 8;
                this[offset + 1] = value & 255;
                return offset + 2
            }
            ;
            Buffer.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 4, 2147483647, -2147483648);
                this[offset] = value & 255;
                this[offset + 1] = value >>> 8;
                this[offset + 2] = value >>> 16;
                this[offset + 3] = value >>> 24;
                return offset + 4
            }
            ;
            Buffer.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert)
                    checkInt(this, value, offset, 4, 2147483647, -2147483648);
                if (value < 0)
                    value = 4294967295 + value + 1;
                this[offset] = value >>> 24;
                this[offset + 1] = value >>> 16;
                this[offset + 2] = value >>> 8;
                this[offset + 3] = value & 255;
                return offset + 4
            }
            ;
            function checkIEEE754(buf, value, offset, ext, max, min) {
                if (offset + ext > buf.length)
                    throw new RangeError("Index out of range");
                if (offset < 0)
                    throw new RangeError("Index out of range")
            }
            function writeFloat(buf, value, offset, littleEndian, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert) {
                    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e38, -3.4028234663852886e38)
                }
                ieee754.write(buf, value, offset, littleEndian, 23, 4);
                return offset + 4
            }
            Buffer.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
                return writeFloat(this, value, offset, true, noAssert)
            }
            ;
            Buffer.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
                return writeFloat(this, value, offset, false, noAssert)
            }
            ;
            function writeDouble(buf, value, offset, littleEndian, noAssert) {
                value = +value;
                offset = offset >>> 0;
                if (!noAssert) {
                    checkIEEE754(buf, value, offset, 8, 1.7976931348623157e308, -1.7976931348623157e308)
                }
                ieee754.write(buf, value, offset, littleEndian, 52, 8);
                return offset + 8
            }
            Buffer.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
                return writeDouble(this, value, offset, true, noAssert)
            }
            ;
            Buffer.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
                return writeDouble(this, value, offset, false, noAssert)
            }
            ;
            Buffer.prototype.copy = function copy(target, targetStart, start, end) {
                if (!start)
                    start = 0;
                if (!end && end !== 0)
                    end = this.length;
                if (targetStart >= target.length)
                    targetStart = target.length;
                if (!targetStart)
                    targetStart = 0;
                if (end > 0 && end < start)
                    end = start;
                if (end === start)
                    return 0;
                if (target.length === 0 || this.length === 0)
                    return 0;
                if (targetStart < 0) {
                    throw new RangeError("targetStart out of bounds")
                }
                if (start < 0 || start >= this.length)
                    throw new RangeError("sourceStart out of bounds");
                if (end < 0)
                    throw new RangeError("sourceEnd out of bounds");
                if (end > this.length)
                    end = this.length;
                if (target.length - targetStart < end - start) {
                    end = target.length - targetStart + start
                }
                var len = end - start;
                var i;
                if (this === target && start < targetStart && targetStart < end) {
                    for (i = len - 1; i >= 0; --i) {
                        target[i + targetStart] = this[i + start]
                    }
                } else if (len < 1e3) {
                    for (i = 0; i < len; ++i) {
                        target[i + targetStart] = this[i + start]
                    }
                } else {
                    Uint8Array.prototype.set.call(target, this.subarray(start, start + len), targetStart)
                }
                return len
            }
            ;
            Buffer.prototype.fill = function fill(val, start, end, encoding) {
                if (typeof val === "string") {
                    if (typeof start === "string") {
                        encoding = start;
                        start = 0;
                        end = this.length
                    } else if (typeof end === "string") {
                        encoding = end;
                        end = this.length
                    }
                    if (val.length === 1) {
                        var code = val.charCodeAt(0);
                        if (code < 256) {
                            val = code
                        }
                    }
                    if (encoding !== undefined && typeof encoding !== "string") {
                        throw new TypeError("encoding must be a string")
                    }
                    if (typeof encoding === "string" && !Buffer.isEncoding(encoding)) {
                        throw new TypeError("Unknown encoding: " + encoding)
                    }
                } else if (typeof val === "number") {
                    val = val & 255
                }
                if (start < 0 || this.length < start || this.length < end) {
                    throw new RangeError("Out of range index")
                }
                if (end <= start) {
                    return this
                }
                start = start >>> 0;
                end = end === undefined ? this.length : end >>> 0;
                if (!val)
                    val = 0;
                var i;
                if (typeof val === "number") {
                    for (i = start; i < end; ++i) {
                        this[i] = val
                    }
                } else {
                    var bytes = Buffer.isBuffer(val) ? val : new Buffer(val,encoding);
                    var len = bytes.length;
                    for (i = 0; i < end - start; ++i) {
                        this[i + start] = bytes[i % len]
                    }
                }
                return this
            }
            ;
            var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;
            function base64clean(str) {
                str = stringtrim(str).replace(INVALID_BASE64_RE, "");
                if (str.length < 2)
                    return "";
                while (str.length % 4 !== 0) {
                    str = str + "="
                }
                return str
            }
            function stringtrim(str) {
                if (str.trim)
                    return str.trim();
                return str.replace(/^\s+|\s+$/g, "")
            }
            function toHex(n) {
                if (n < 16)
                    return "0" + n.toString(16);
                return n.toString(16)
            }
            function utf8ToBytes(string, units) {
                units = units || Infinity;
                var codePoint;
                var length = string.length;
                var leadSurrogate = null;
                var bytes = [];
                for (var i = 0; i < length; ++i) {
                    codePoint = string.charCodeAt(i);
                    if (codePoint > 55295 && codePoint < 57344) {
                        if (!leadSurrogate) {
                            if (codePoint > 56319) {
                                if ((units -= 3) > -1)
                                    bytes.push(239, 191, 189);
                                continue
                            } else if (i + 1 === length) {
                                if ((units -= 3) > -1)
                                    bytes.push(239, 191, 189);
                                continue
                            }
                            leadSurrogate = codePoint;
                            continue
                        }
                        if (codePoint < 56320) {
                            if ((units -= 3) > -1)
                                bytes.push(239, 191, 189);
                            leadSurrogate = codePoint;
                            continue
                        }
                        codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536
                    } else if (leadSurrogate) {
                        if ((units -= 3) > -1)
                            bytes.push(239, 191, 189)
                    }
                    leadSurrogate = null;
                    if (codePoint < 128) {
                        if ((units -= 1) < 0)
                            break;
                        bytes.push(codePoint)
                    } else if (codePoint < 2048) {
                        if ((units -= 2) < 0)
                            break;
                        bytes.push(codePoint >> 6 | 192, codePoint & 63 | 128)
                    } else if (codePoint < 65536) {
                        if ((units -= 3) < 0)
                            break;
                        bytes.push(codePoint >> 12 | 224, codePoint >> 6 & 63 | 128, codePoint & 63 | 128)
                    } else if (codePoint < 1114112) {
                        if ((units -= 4) < 0)
                            break;
                        bytes.push(codePoint >> 18 | 240, codePoint >> 12 & 63 | 128, codePoint >> 6 & 63 | 128, codePoint & 63 | 128)
                    } else {
                        throw new Error("Invalid code point")
                    }
                }
                return bytes
            }
            function asciiToBytes(str) {
                var byteArray = [];
                for (var i = 0; i < str.length; ++i) {
                    byteArray.push(str.charCodeAt(i) & 255)
                }
                return byteArray
            }
            function utf16leToBytes(str, units) {
                var c, hi, lo;
                var byteArray = [];
                for (var i = 0; i < str.length; ++i) {
                    if ((units -= 2) < 0)
                        break;
                    c = str.charCodeAt(i);
                    hi = c >> 8;
                    lo = c % 256;
                    byteArray.push(lo);
                    byteArray.push(hi)
                }
                return byteArray
            }
            function base64ToBytes(str) {
                return base64.toByteArray(base64clean(str))
            }
            function blitBuffer(src, dst, offset, length) {
                for (var i = 0; i < length; ++i) {
                    if (i + offset >= dst.length || i >= src.length)
                        break;
                    dst[i + offset] = src[i]
                }
                return i
            }
            function isnan(val) {
                return val !== val
            }
        }
        , {
            "base64-js": 19,
            ieee754: 21
        }],
        21: [function(require, module, exports) {
            exports.read = function(buffer, offset, isLE, mLen, nBytes) {
                var e, m;
                var eLen = nBytes * 8 - mLen - 1;
                var eMax = (1 << eLen) - 1;
                var eBias = eMax >> 1;
                var nBits = -7;
                var i = isLE ? nBytes - 1 : 0;
                var d = isLE ? -1 : 1;
                var s = buffer[offset + i];
                i += d;
                e = s & (1 << -nBits) - 1;
                s >>= -nBits;
                nBits += eLen;
                for (; nBits > 0; e = e * 256 + buffer[offset + i],
                i += d,
                nBits -= 8) {}
                m = e & (1 << -nBits) - 1;
                e >>= -nBits;
                nBits += mLen;
                for (; nBits > 0; m = m * 256 + buffer[offset + i],
                i += d,
                nBits -= 8) {}
                if (e === 0) {
                    e = 1 - eBias
                } else if (e === eMax) {
                    return m ? NaN : (s ? -1 : 1) * Infinity
                } else {
                    m = m + Math.pow(2, mLen);
                    e = e - eBias
                }
                return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
            }
            ;
            exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
                var e, m, c;
                var eLen = nBytes * 8 - mLen - 1;
                var eMax = (1 << eLen) - 1;
                var eBias = eMax >> 1;
                var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
                var i = isLE ? 0 : nBytes - 1;
                var d = isLE ? 1 : -1;
                var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
                value = Math.abs(value);
                if (isNaN(value) || value === Infinity) {
                    m = isNaN(value) ? 1 : 0;
                    e = eMax
                } else {
                    e = Math.floor(Math.log(value) / Math.LN2);
                    if (value * (c = Math.pow(2, -e)) < 1) {
                        e--;
                        c *= 2
                    }
                    if (e + eBias >= 1) {
                        value += rt / c
                    } else {
                        value += rt * Math.pow(2, 1 - eBias)
                    }
                    if (value * c >= 2) {
                        e++;
                        c /= 2
                    }
                    if (e + eBias >= eMax) {
                        m = 0;
                        e = eMax
                    } else if (e + eBias >= 1) {
                        m = (value * c - 1) * Math.pow(2, mLen);
                        e = e + eBias
                    } else {
                        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
                        e = 0
                    }
                }
                for (; mLen >= 8; buffer[offset + i] = m & 255,
                i += d,
                m /= 256,
                mLen -= 8) {}
                e = e << mLen | m;
                eLen += mLen;
                for (; eLen > 0; buffer[offset + i] = e & 255,
                i += d,
                e /= 256,
                eLen -= 8) {}
                buffer[offset + i - d] |= s * 128
            }
        }
        , {}],
        22: [function(require, module, exports) {
            "use strict";
            function hasOwnProperty(obj, prop) {
                return Object.prototype.hasOwnProperty.call(obj, prop)
            }
            module.exports = function(qs, sep, eq, options) {
                sep = sep || "&";
                eq = eq || "=";
                var obj = {};
                if (typeof qs !== "string" || qs.length === 0) {
                    return obj
                }
                var regexp = /\+/g;
                qs = qs.split(sep);
                var maxKeys = 1e3;
                if (options && typeof options.maxKeys === "number") {
                    maxKeys = options.maxKeys
                }
                var len = qs.length;
                if (maxKeys > 0 && len > maxKeys) {
                    len = maxKeys
                }
                for (var i = 0; i < len; ++i) {
                    var x = qs[i].replace(regexp, "%20"), idx = x.indexOf(eq), kstr, vstr, k, v;
                    if (idx >= 0) {
                        kstr = x.substr(0, idx);
                        vstr = x.substr(idx + 1)
                    } else {
                        kstr = x;
                        vstr = ""
                    }
                    k = decodeURIComponent(kstr);
                    v = decodeURIComponent(vstr);
                    if (!hasOwnProperty(obj, k)) {
                        obj[k] = v
                    } else if (isArray(obj[k])) {
                        obj[k].push(v)
                    } else {
                        obj[k] = [obj[k], v]
                    }
                }
                return obj
            }
            ;
            var isArray = Array.isArray || function(xs) {
                return Object.prototype.toString.call(xs) === "[object Array]"
            }
        }
        , {}],
        23: [function(require, module, exports) {
            "use strict";
            var stringifyPrimitive = function(v) {
                switch (typeof v) {
                case "string":
                    return v;
                case "boolean":
                    return v ? "true" : "false";
                case "number":
                    return isFinite(v) ? v : "";
                default:
                    return ""
                }
            };
            module.exports = function(obj, sep, eq, name) {
                sep = sep || "&";
                eq = eq || "=";
                if (obj === null) {
                    obj = undefined
                }
                if (typeof obj === "object") {
                    return map(objectKeys(obj), function(k) {
                        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
                        if (isArray(obj[k])) {
                            return map(obj[k], function(v) {
                                return ks + encodeURIComponent(stringifyPrimitive(v))
                            }).join(sep)
                        } else {
                            return ks + encodeURIComponent(stringifyPrimitive(obj[k]))
                        }
                    }).join(sep)
                }
                if (!name)
                    return "";
                return encodeURIComponent(stringifyPrimitive(name)) + eq + encodeURIComponent(stringifyPrimitive(obj))
            }
            ;
            var isArray = Array.isArray || function(xs) {
                return Object.prototype.toString.call(xs) === "[object Array]"
            }
            ;
            function map(xs, f) {
                if (xs.map)
                    return xs.map(f);
                var res = [];
                for (var i = 0; i < xs.length; i++) {
                    res.push(f(xs[i], i))
                }
                return res
            }
            var objectKeys = Object.keys || function(obj) {
                var res = [];
                for (var key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key))
                        res.push(key)
                }
                return res
            }
        }
        , {}],
        24: [function(require, module, exports) {
            "use strict";
            exports.decode = exports.parse = require("./decode");
            exports.encode = exports.stringify = require("./encode")
        }
        , {
            "./decode": 22,
            "./encode": 23
        }]
    }, {}, [1])(1)
});
