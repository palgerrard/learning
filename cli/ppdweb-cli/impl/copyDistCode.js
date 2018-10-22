const shell = require('shelljs')
const path = require('path')
const fs = require('fs')

const distDirPath = path.resolve('./dist')

/**
 * 检查是否有dist目录
 * @return {[type]} [description]
 */
const checkDistDir = () => {
  let exist = true
  if (!fs.existsSync(distDirPath)) {
    exist = false
    console.log('没有找到dist目录，请确定dist已生成再执行命令'.red)
  }
  return exist
}

// copy dist to develop branch svn path
const copyDistToDevelop = (config) => {
  if (!checkDistDir()) {
    return
  }
  shell.exec(`
                cd ~/learning/cli/dist
                touch cli_log.txt & echo last copy files at $(date +%Y%m%d%H%M) > cli_log.txt
                mv * ${config.cdn_release_branch_path}
              `, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`)
    }
    console.log(`${stdout}`)
    console.log(`${stderr}`)
    console.log(`[result] dist dir copy to develop dir success !`.info)
  })
}

// copy dist to release branch svn path
const copyDistToRelease = () => {
  checkDistDir()
  shell.exec(`
                cd ~/learning/cli/dist
                touch last.txt
                mv *  ~/learning/cli/ori/
              `, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`)
    }
    console.log(`${stdout}`)
    console.log(`${stderr}`)
    console.log(`[result] dist dir copy to release dir success !`.info)
  })
}

module.exports = {
  copyDistToDevelop,
  copyDistToRelease
}
