## socketcluster通彩实践DEMO
>该demo项目，总结了通彩2年来的socketcluster使用经验。定位不是框架，只是业务代码的写法实践。主要保留了几个核心思想
- 1.worker负责业务的emit/on以及订阅/广播消息，producer负责数据生产
- 2.业务按照维度划分到不同的worker，producer
- 3.producer分为ProducerServer和ProducerClient的概念。有远程Server和本地Server 2个概念。

另外，这个项目的目标是：“学习成本很低，拷贝过去稍微改改就能快速用起来”。保证用户在学习完官网的guide后，就能快速上手，所以废弃掉一些不必要的封装带来的学习成本。

## 运行

### 数据源在本地版本
第一步：
$ npm run start
第二步：
浏览器访问： http://localhost:8000/test.html


### 数据源在远程的版本
第一步： 开启一个远程的dataSource server
$ npm run start_remote_dataSource_server
第二步： 开启ws服务，数据源来自远程的dataSource server
$ npm run start_with_dataSource_from_remote
第三步：
浏览器访问： http://localhost:8000/test.html

### 关于代码

#### 项目基础代码来源

拷贝自node_modules/socketcluster/sample

少量修改了
server.js 
worker.js

增加了：
eslintrc.js
.gitignore

增加了
publis/test.html

增加了colors库
npm install colors -save

增加了/business_ext
对原本的socketcluster做业务增强的模块

增加了/dataSource
数据源模块

增加了/worker

增加了/producer


## 规划
- eproxy 实现websocket发送http请求到本机的http服务
- 能快速实现房间概念，对人对战
- 扩展插件：比如数据的前后对比

