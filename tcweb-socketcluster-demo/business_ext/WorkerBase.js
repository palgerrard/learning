'use strict';

const EventEmitter = require('events').EventEmitter;
const ProducerClient = require('./ProducerClient');
const colors = require( 'colors');

/**
 * worker基类
 */
class WorkerBase extends EventEmitter{
    //初始化
    constructor(options) {
        super();
        let {name, scServer, worker} = options;
        this.name = name;
        this.scServer = scServer;
        this.worker = worker;
        this.init();

    }

    //发送消息到所有的workers。从当前worker发送到所有内核的worker，包括本身
    transferMessageToAllWorkers(data) {
        this.worker.sendToMaster({
            type: 'toAllWorksMessage',
            data: data
        });
    }

    //监听Master分发的消息
    onTransferMessage(callback) {
        this.worker.on('masterMessage', function(data) {
            if (data && data.type === 'toAllWorksMessage') { //除去producer的sendToWorker(0, data)的消息
                callback(data.data);
            }
        });
    }

    //启动函数
    init() {
        try {
            //获取一个producerClient实例
            this.producerClient = ProducerClient.getInstance(this.scServer, this.worker);
            this.start(this.scServer, this.worker);
        } catch (er) {
            console.error('error while start worker: ' + this.name);
            console.error(er.stack || er);
        }
    }

    //worker的启动函数
    start(){
        console.info(`worker ${this.name} : start method should implement in subclass...`);
    }

    //处理客户端的subscribe
    onSubscribe(channel, option) {
        this.scServer.addMiddleware(this.scServer.MIDDLEWARE_SUBSCRIBE, function(request, next) {
            var socket = request.socket;
            var c = request.channel;
            if (channel === c && typeof option.getInitData === 'function'){
                option.getInitData.apply(this, [socket, channel]);
            }
            next();
        });
    }

    //日志
    log(...args){
        console.log(`【worker_${this.name}】:`.green, ...args);
        //console.log.apply(this, args);
    }

    //析构函数
    destroy() {
        this.name = '';
        this.scServer = null;
        this.worker = null;
    }
}

module.exports = WorkerBase;
