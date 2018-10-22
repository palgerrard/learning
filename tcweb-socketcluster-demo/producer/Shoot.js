'use strict';

var ProducerServer = require('../business_ext/ProducerServer');
var MonsterGen = require('../dataSource/MonsterGen.js');

class Shoot extends ProducerServer {
    constructor(options) {
        super(options);
    }

    start() {
        this.log('tart producer Shoot');

        var monsterGen = new MonsterGen();
        monsterGen.on('dataChange', (newData, oldData, from) =>{
            this.push('monster.gen', newData);
        });

        monsterGen.start();  //启动
    }

}

module.exports = Shoot;
