'use strict';
const colors = require( 'colors');

/**
 * ProducerServer基类
 * 业务ProducerServer的基类
 * 主要调用DataSource，获取变化的数据，然后发送给ProducerClient
 */
class ProducerServer {
    constructor(options) {
        let {name, sendToClient} = options;
        this.name = name;
        this.delayKeys = {}; //延迟push的keys
        this.delayPushData = {}; //延迟pushu的数据
        this.sendToClient = sendToClient; //发送数据到client的方法
        this.dealyInterval = setInterval(function() { //每5ms，将delaypush的数据，发出去
            this.flushDelayData();
        }.bind(this), 30); //30ms间隔
    }

    //处理远程推送过来的数据
    dealRemoteDataChange(dataKey, data){
        this.log('dealRemoteDataChange method should implement in subclass...');
    }

    //注册延迟push数据
    registerDelay(key) {
        if (!this.delayKeys[key]) {
            this.delayKeys[key] = true;
        }
    }

    //将延迟push的数据发出去
    flushDelayData() {
        let keys = Object.keys(this.delayKeys);
        keys.forEach((k) => {
            if (this.delayPushData[k]) {
                let pushData = this.delayPushData[k];
                this.sendToClient(pushData);
                this.delayPushData[k] = null; //push后，清空
            }
        });
    }

    /**
     * 有新数据，push到server端
     * @param  {[type]} channel [description]
     * @param  {[type]} data    [description]
     * @return {[type]}         [description]
     */
    push(key, data) {
        let pushData = {
            key: key,
            data: data
        };
        if (this.delayKeys[key]) {
            this.delayPushData[key] = pushData;
        } else {
            this.sendToClient(pushData);
        }
    }

    destroy() {
        for (let key in this.timerContain) {
            let timer = this.timerContain[key];
            clearTimeout(timer.handler);
        }
        if (this.dealyInterval) {
            clearInterval(this.dealyInterval);
            this.dealyInterval = null;
            delete this.dealyInterval;
        }
    }

    //日志
    log(...args){
        console.log(`【producer_${this.name}】:`.blue, ...args);
        //console.log.apply(this, args);
    }

}

module.exports = ProducerServer;
