'use strict';

var WorkerBase = require('../business_ext/WorkerBase');

class Shoot extends WorkerBase {
    constructor(options) {
        super(options);
    }

    start(scServer, worker) {
        //收听客户端连接
        scServer.on('connection', (socket) => {
            //监听客户端发过来的shoot.order消息
            socket.on('shoot.order', (data, res) => {
                this.log('Handled shoot.order', data);
                //callback回去
                res(null, {
                    errCode: 0,
                    data: 'success'
                });
            });

            var interval = setInterval(() => {
                socket.emit('shoot.emitTest', {
                    number: Math.floor(Math.random() * 5)
                });
            }, 5000);

            socket.on('disconnect', () => {
                clearInterval(interval);
            });
        });

        //处理客户端发过来的订阅事件，这里用来处理返回初始化数据
        this.onSubscribe('shoot_monster_gen', {
            getInitData: (socket, channel) => {
                this.log('shoot.monster_gen_initData');
                socket.emit('shoot.monster_gen_initData', {
                    shoot: 'shoot_monster_gen init data'
                });
            }
        });

        //业务接收数据更新，进行组合，最后进行publish
        this.producerClient.on('monster.gen', function(newData) {
            scServer.exchange.publish('shoot_monster_gen', newData);
        });
    }

}

module.exports = Shoot;
