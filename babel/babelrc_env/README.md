## .baberc的用法

.babelrc
```javascript
{
  "env": {
    "development": {
      	"presets": [
        	["env", { "targets": { "node": 8 }}]
      	]
    },

    "test": {
      	"presets": [
        	["es2015", { "targets": { "node": 8 }}]
      	]
    }
  }
}
```

#### node env.js 
不指定BABEL_ENV, 对应的process.env.BABEL_ENV:development

#### BABEL_ENV=test node env.js 
通过BABWL_ENV=test，指定对应的process.env.BABEL_ENV:test

#### .babelrc中定义env

env 选项的值将从 process.env.BABEL_ENV 获取，如果没有的话，则获取 process.env.NODE_ENV 的值，它也无法获取时会设置为 "development" 

下面通过箭头函数的例子，分别看2种编译的效果

babel test_env.js -o ./dist/test_env_b.js
BABEL_ENV=test node babel test_env.js -o ./dist/test_env_2015.js

