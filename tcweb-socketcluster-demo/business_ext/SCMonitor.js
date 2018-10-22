'use strict';

/**
 * 针对socketcluster主程序的监控
 */
class SCMonitor {
    //构造函数
    constructor(socketcluster, options) {
        this.socketcluster = socketcluster;
        this.options = options || {};
    }

    init() {
        const socketcluster = this.socketcluster;
        //worker异常crash消息
        socketcluster.on(socketcluster.EVENT_WORKER_EXIT, (workerInfo) => {
            //report
            console.error('##### ws_worker_exit:', workerInfo);
        });

        //worker错误
        socketcluster.on(socketcluster.EVENT_FAIL, (err) => {
            //report
            console.error('#### ws_worker_error:', err);
        });

        //worker警告
        socketcluster.on(socketcluster.EVENT_WARNING, (warning) => {
            //report
        });
    }

    //析构函数
    destroy() {
        this.socketcluster = null;
        this.options = null;
    }
}

module.exports = SCMonitor;
