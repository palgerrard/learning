'use strict';

/**
 * SCServer的管理
 * 可以在这里对所有的SCServer进行监控上报或者一些业务层面的特殊设置
 */
class SCServerMgr {
    //构造函数
    constructor(scServer, options) {
        this.scServer = scServer;
        this.options = options || {};
    }

    /**
     * 初始化
     * @return {[type]} [description]
     */
    init() {
        const scServer = this.scServer;

        scServer.on('connection', (socket) => {
            //report
            socket.on('disconnect', () => {
                //report
            });
        });

        scServer.on('error', (err) => {
            //report
        });

        scServer.on('notice', (err) => {
            //report
        });

        scServer.on('handshake', () => {
            //report
        });

        scServer.on('badSocketAuthToken', (socket, err) => {
            //report
        });

        //订阅某个频道
        scServer.addMiddleware(scServer.MIDDLEWARE_SUBSCRIBE, (request, next) => {
            //todo something
            next();
        });

        //客户端的push过来。做一些过滤处理等。这里做路由处理。
        scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_IN, (request, next) => {
            //todo something
            next();
        });

        //收到客户端的emit消息的路由处理
        scServer.addMiddleware(scServer.MIDDLEWARE_EMIT, (request, next) => {
            //todo something
            next();
        });

        // 服务端PUSH内容出去。这里一般不需要处理 对应客户端的watch信息。
        scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_OUT, (request, next) => {
            //todo something
            next();
        });

        scServer.addMiddleware(scServer.MIDDLEWARE_HANDSHAKE_WS, (request, next) => {

            let isValid = true;

            /*
            example:
            let isValid = false;
            let headers = request.headers;
            let _origin = headers.referer || headers.origin || ''; //这里“”为默认值，如果为undefined,后面报错，worker会core
            let _url = toolUrl.parse(_origin);
            //校验规则： .qq.com;
            //servicewechat.com 微信小程序(注意前面是没有一个点号的)
            if (_url) {
                if ((/\.qq\.com$/).test(_url.hostname) || 'servicewechat.com' === _url.hostname) {
                    isValid = true;
                }
            }
            */

            let maxClientEachServer = this.options.maxClientEachServer;
            if (scServer.clientsCount >= maxClientEachServer) { //最大连接数限制
                next('-2003');
            } else if (isValid) {
                next();
            } else {
                next('-2002');
            }
        });

    }

    //析构函数
    destroy() {
        this.scServer = null;
        this.options = null;
    }
}

module.exports = SCServerMgr;
