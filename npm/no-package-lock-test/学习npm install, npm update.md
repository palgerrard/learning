## 学习npm install, npm update - 2018/09/18

## .npmrc中配置package-lock=false
不会生成package-lock.json

## npm install 

如果没有安装旧的package,当前最新版本为1.0.9, package.json中指定的是"^1.0.8", 执行npm install会得到最新的1.0.9版本

如果已经安装了旧的package,即使有新版本的package,执行npm install不做任何事情

## npm update 

如果没有安装旧的package,当前最新版本为1.0.9, package.json中指定的是"^1.0.8", 执行npm update会得到最新的1.0.9版本。但是package.json中的版本号还是"^1.0.8"。其实和npm install表现完全一致。

如果已经安装了旧的package,执行npm update,会更新package,【而且】会将package.json中的版本号更新