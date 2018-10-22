'use strict';

var EventEmitter = require('events').EventEmitter;
var instance;

/**
 * Producer客户端
 * 用于获取ProducerServer发送过来的数据
 * 目前是通过跨进程通信和ProducerServer通信
 * 是单例对象
 */
class ProducerClient extends EventEmitter {

    constructor(scServer, worker) {
        super();
        this.scServer = scServer;
        this.worker = worker;
        this.listenDataChange();
    }

    static getInstance(scServer, worker) {
        if (!instance) {
            instance = new ProducerClient(scServer, worker);
        }
        return instance;
    }

    //监听数据源数据变化的推送
    listenDataChange() {
        this.worker.on('masterMessage', (data) => {
            if (data && data.type && data.type == 'producer_dataChange') {
                var d = data.data;
                EventEmitter.prototype.emit.call(this, d.key, d.data); //将缓存的数据，推送出去
            }
        });
    }
}

module.exports = ProducerClient;
