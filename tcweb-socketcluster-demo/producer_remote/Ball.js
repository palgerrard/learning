'use strict';

var ProducerServer = require('../business_ext/ProducerServer');

class Ball extends ProducerServer {
    constructor(options) {
        super(options);
    }

    start() {
        //not do anything
        this.log('start producer Ball');
    }

    //处理远程推送过来的数据
    dealRemoteDataChange(dataKey, data){
        if (dataKey === 'match_odds'){
            this.push('match.odds', data);
        }
    }

}

module.exports = Ball;
