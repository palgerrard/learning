'use strict';

const fs = require('fs');
const path = require('path');
const SocketClusterClient = require('socketcluster-client');

/**
 *  ProducerMgr producer管理器 socketclient版本
 *  数据源服务器是第三方服务，通过websocket推送过来
 */
class ProducerMgrRemote{
    //构造函数
    constructor(socketcluster, options) {
        this.socketcluster = socketcluster;
        this.options = options || {};
        this.producerMap = {};
        this.initProducersSync();
    }

    init() {
        console.info('   >> producers start at: ' + new Date().getTime());
        console.info('   >> producers start config : ', this.options);
        var options = {
            port: this.options.dataSourceServerPort || 8000,
            hostname: this.options.dataSourceServerIp || '127.0.0.1',
            autoReconnectOptions: {
                maxDelay: 1000 //重试最大延迟时间1s
            }
        };

        // Initiate the connection to the server
        var socket = SocketClusterClient.connect(options);

        socket.on('connect', function () {
            console.info('   >> producer CONNECTED to socketServer !\n', options);
            console.info('   >> producers  start success: ' + new Date().getTime());
        });

        socket.on('error', function () {
            console.log('error', arguments);
        });

        let channel = socket.subscribe('remote_dataSrouce');

        channel.on('subscribeFail', function (err) {
            console.error('Failed to subscribe to the remote_dataSrouce channel due to error: ' + err);
        });

        channel.watch((res) => {
            //console.log('ProducerMgrRemote get data:', res);
            let business = res.business;  //业务名称
            let dataKey = res.dataKey; //业务下某个数据
            let data = res.data; //推送过来的数据
            //这里也可以通过businessName来区分业务，然后再读区一个producer目录，让各自业务的producer处理
            let producer = this.producerMap[business];
            if (producer &&
                typeof producer.dealRemoteDataChange === 'function'){
                producer.dealRemoteDataChange.apply(producer, [dataKey, data]);
            }
            //console.log('remote_dataSrouce channel message:', data);
        });
    }

    /**
     * 初始化所有的producer
     * @return {[type]} [description]
     */
    initProducersSync(){
        let dirname =  this.options.dir ||  __dirname + '/producer';
        let list = fs.readdirSync(dirname);

        console.info('   >> producer list :', list);

        //定义Server向客户端发送消息的具体实现。这里是主进程向第一个子worker进程发送消息
        let sendToClient = (data)=>{
            this.socketcluster.sendToWorker(0, {
                type:'producer_dataChange',
                data:data
            });
        };

        list.forEach((v) => {
            let name = path.basename(v, '.js');
            let mod = dirname + '/' + v;
            if (!(/\.js$/).test(mod)){
                return true;
            }

            try {
                let p = require(mod);
                if (typeof(p) === 'function') {
                    p = new p({
                        name,
                        sendToClient
                    });
                }
                p.start();
                this.producerMap[name] = p;
            } catch (err) {
                console.error('error while start producer ', mod);
                console.error(err.stack || err);
            }
        });
        //console.log('ProducerMgrRemote producerMap', this.producerMap);
    }

    /**
     * 析构函数
     */
    destroy(){
        this.socketcluster = null;
        this.options = null;
        this.producerMap = {};
    }
}

module.exports = ProducerMgrRemote;

