'use strict';

var WorkerBase = require('../business_ext/WorkerBase');

class Ball extends WorkerBase {
    constructor(options) {
        super(options);
    }

    start(scServer, worker) {
        let business = 'Ball';  //业务名称
        let dataKey = 'match_odds'; //业务下某个数据
        let data = {
            matchId: '001',
            win: 1.01,
            draw: 3.03,
            lose: 4.08
        };

        //推送出去的数据
        let pubData = {
            business,
            dataKey,
            data
        };

        setInterval(()=>{
            scServer.exchange.publish('remote_dataSrouce', pubData);
        }, 3000);

        //业务接收数据更新，进行组合，最后进行publish
        this.producerClient.on('match.odds', (newData) => {
            scServer.exchange.publish('match_odds', newData);
        });

    }

}

module.exports = Ball;
