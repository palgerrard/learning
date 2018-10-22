
'use strict';

const fs = require('fs');
const path = require('path');

/**
 *  ProducerMgrLocal producer管理器
 *  每个业务有独立的producerServer,用来生产数据源
 *  实现在代码层面的隔离
 */
class ProducerMgrLocal{
    //构造函数
    constructor(socketcluster, options) {
        this.socketcluster = socketcluster;
        this.options = options || {};
    }

    init(){
        console.info('   >> producer start !!!');

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

            } catch (err) {
                console.error('error while start producer ', mod);
                console.error(err.stack || err);
            }
        });
    }

    /**
     * 析构函数
     */
    destroy(){
        this.socketcluster = null;
        this.options = null;
    }
}

module.exports = ProducerMgrLocal;
