#!/usr/bin/env node

const program = require('commander')
const inquirer = require('inquirer')
const shell = require('shelljs')
const copyDistCode = require('./impl/copyDistCode')
const colors = require('colors')
const path = require('path')
const fs = require('fs')

const initConfig = () => {
  const configPath = path.resolve('./ppdweb.config.json')
  if (!fs.existsSync(configPath)) {
  	   console.log('当前项目（目录）未找到ppdweb.config.json\n你可以使用 "ppdweb init" 来生成一个默认的ppdweb.config.json'.red)
	   throw new Error('ppdweb.config.json not exist!')
  }
  const data = fs.readFileSync(configPath, 'utf8')
  return JSON.parse(data)
}

const config = initConfig()

colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
})

program.version(require('./package.json').version)

program
  .command('init')
  .description('创建项目')
  .action(() => {
  	initAction(config)
  })

// copy dist to develop branch svn path
program
  .command('d2d')
  .description('创建项目')
  .action(() => {
  	copyDistCode.copyDistToDevelop(config)
  })

// copy dist to release branch svn path
program
  .command('d2r')
  .description('创建项目')
  .action(() => {
  	copyDistCode.copyDistToRelease(config)
  })

program.parse(process.argv)

console.log('hello ppdweb cli')
