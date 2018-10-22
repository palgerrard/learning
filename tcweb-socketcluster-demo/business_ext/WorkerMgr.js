'use strict';

const fs = require('fs');
const path = require('path');

/**
 *
 *  WorkerMgr worker管理器
 *  优化worker中写代码方式，把单worker文件拆分为多个worker文件。
 *  每个worker文件中写一块独立的业务，实现在代码层面的隔离
 */
class WorkerMgr {
    //构造函数
    constructor(scServer, worker, options) {
        this.scServer = scServer;
        this.worker = worker;
        this.options = options || {};
    }

    /**
     * 初始化
     * @return {[type]} [description]
     */
    init() {
        console.info('   >> worker start !!!');

        const dirname = this.options.dir || 'worker';

        if (!dirname) {
            throw new Error('opt dir is undefined');
        }

        let list = fs.readdirSync(dirname);

        console.info('   >> worker list :', list);

        list.forEach((v) => {
            let mod = `${dirname}/${v}`;
            const regJs = /\.js$/;

            if (!regJs.test(mod)) {
                return true;
            }

            let name = path.basename(mod, '.js');

            try {
                var w = require(mod);
                if (typeof w === 'function') {
                    w = new w({
                        name: name,
                        scServer: this.scServer,
                        worker: this.worker
                    });
                }
            } catch (err) {
                console.error('error while start worker', mod);
                console.error(err.stack || err);
            }
        });
    }

    /**
     * 析构函数
     */
    destroy() {
        this.scServer = null;
        this.worker = null;
        this.options = null;
    }
}

module.exports = WorkerMgr;
