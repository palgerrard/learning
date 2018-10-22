## 学习package-lock.json - 2018/09/18

#### 为什么有package-lock.json

根据官方文档，这个package-lock.json 是在 `npm install`时候生成一份文件，用以记录当前状态下实际安装的各个npm package的具体来源和版本号。

它有什么用呢？因为npm是一个用于管理package之间依赖关系的管理器，它允许开发者在pacakge.json中间标出自己项目对npm各库包的依赖。你可以选择以如下方式来标明自己所需要库包的版本

这里举个例子：

"dependencies": {
 "@types/node": "^8.0.33",
},

这里面的 向上标号^是定义了向后（新）兼容依赖，指如果 types/node的版本是超过8.0.33，并在大版本号（8）上相同，就允许下载最新版本的 types/node库包，例如实际上可能运行npm install时候下载的具体版本是8.0.35。波浪号

大多数情况这种向新兼容依赖下载最新库包的时候都没有问题，可是因为npm是开源世界，各库包的版本语义可能并不相同，有的库包开发者并不遵守严格这一原则：相同大版本号的同一个库包，其接口符合兼容要求。这时候用户就很头疼了：在完全相同的一个nodejs的代码库，在不同时间或者不同npm下载源之下，下到的各依赖库包版本可能有所不同，因此其依赖库包行为特征也不同有时候甚至完全不兼容。

因此npm最新的版本就开始提供自动生成package-lock.json功能，为的是让开发者知道只要你保存了源文件，到一个新的机器上、或者新的下载源，只要按照这个package-lock.json所标示的具体版本下载依赖库包，就能确保所有库包与你上次安装的完全一样。

#### package-lock.json的实现改了3次，网上搜索这个东西概念，很多错的，所以自己做了个实验验证。

#### 测试当前版本npm(v6.4.1, node版本为v8.11.4) package-lock.json的表现

case1: 如果npm包升级为1.0.2
如果package.json中（主动修改为1.0.2）和package-lock.json（当前为1.0.1） 不一致，npm install会更新到最新版本1.0.2 （package.json和package-lock.json【都会】更新到1.0.2）

case 2:
如果npm包升级为1.0.3
如果package.json中（当前为1.0.2）和package-lock.json（当前为1.0.2） 一致，npm install【不会】更新到最新版本1.0.3
但执行 npm install doublezhang-firstnpm@1.0.3 这样【可以】升级到最新的1.0.3 （package.json和package-lock.json【都会】更新到1.0.3）

case 3:
如果npm包升级为1.0.4
如果package.json中（当前为1.0.3）和package-lock.json（当前为1.0.3） 一致，npm install【不会】更新到最新版本1.0.4
但执行 npm update 这样【可以】升级到最新的1.0.4 （package.json和package-lock.json【都会】更新到1.0.4）

总结：
1.package-lock.json 加快了npm install 的速度，因为 package-lock.json 文件中已经记录了整个 node_modules 文件夹的树状结构，甚至连模块的下载地址都记录了，再重新安装的时候只需要直接下载文件即可。
2.如果手动更改package.json中某个包的版本，导致该包与package-lock.json中记录的版本不一致，执行npm install会使该包update到最新版本
3.如果package.json中某个包与package-lock.json中的版本一致，却是一个旧版本【但是该包实际上有更新】，可以通过npm install xxx@x.x.x， 或者npm update，来更新到最新的包，并同时更新package.json与package.lock.json中的版本号


#### npm官方建议 package-lock.json 需要commit,而不应该ignore


#### 禁用package-lock.json
局部禁用： echo 'package-lock=false' >> .npmrc
全局禁用： npm config set package-lock false


我感觉哈，package-lock.json的出现，是因为很多垃圾的包，没有遵循semver规范，会导致npm install可能出现不同的版本。如果我们都引用知名的npm包，符合semver规范的包，完全可以设置禁用 package-lock.json


#### tnpm没有package-lock.json，tnpm install，package都会升级

#### package-lock.json是npm受到了来自yarn的压力所做的（yarn-lock），当前版本的npm追赶了yarn的很多特性，似乎可以让大家忘记yarn了