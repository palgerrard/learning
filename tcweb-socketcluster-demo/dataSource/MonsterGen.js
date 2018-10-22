const EventEmitter = require('events').EventEmitter;

class MonsterGen extends EventEmitter {
    constructor() {
        super();
    }

    start() {
        let newData = 'new';
        let oldData = 'old';
        let from = 'ckv';
        setInterval(()=>{
            this.emit('dataChange', newData, oldData, from);
        }, 3000);
    }

}

module.exports = MonsterGen;
