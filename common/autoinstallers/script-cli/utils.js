const path = require("path");

const minimist = require("minimist");
const shell = require("shelljs");

/**
 * @name 在项目 projectName 中执行 command
 * @param {string} projectName
 * @param {string} command
 * @param {function} cb 完成后的回调函数
 */

function runProject(projectName,command,cb) {
    const projectPath = path.join(__dirname,`../../../projects/${projectName}`);
    shell.exec(`cd ${projectPath} && rushx ${command}`),
    (code,stdout,stderr) => {
        if(code !== 0) {
            console.error(projectName,'执行命令出错:',stderr);
            process.exit(1);
        }
        cb && cb();
    }
}

/**
 * 检查 lib 是否存在，如果不存在，需要先 build，之后再执行 command
 * @param {*} projectPaths 依赖 multi-ui 的项目名称
 * @param {*} command 在项目中执行的指令
 */
function ensureLibForCommand(projectPaths, cb) {
    const args = minimist(process.argv.slice(2));
    const force = args.force;
    if (force) {
      shell.exec('rush update');
    }
  
    projectPaths.forEach((projectPath) => {
      const completePath = path.join(__dirname, `../../../${projectPath}`);
      if (force) {
        shell.exec(`rm -rf ${completePath}/dist`);
      }
  
      if (force || !shell.test('-d', `${completePath}/dist`)) {
        console.log(`${projectPath} 不存在，正在打包中...`);
        // 如果不存在，运行 rushx build
        const buildResult = shell.exec(`cd ${completePath} && rushx build`);
  
        // 检查构建是否成功
        if (buildResult.code !== 0) {
          console.error(`打包 ${projectPath} 失败，正在退出...`);
          shell.exec(`rm -rf ${completePath}/dist`);
          process.exit(1);
        }
      }
    });
  
    cb();
  }
  
  module.exports = {
    runProject,
    ensureLibForCommand,
  };
