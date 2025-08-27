const { execSync } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const exec = util.promisify(require("child_process").exec);
const npmLogin = require("npm-cli-login");

// 项目根目录
const projectRootPath = path.join(__dirname, "../../../");
// 子包文件夹
const projectsDir = path.join(projectRootPath, "projects");
// 私域npm
const NPM_REGISTRY_URL = "https://registry.npmjs.org/";

/**
 * @name 解析版本号
 * @param version string 版本号
 * 
 * */
function parseVersion(version) {
  const [semver, preReleaseTag] = version.split("-");
  const [major, minor, patch] = semver.split(".").map(Number);
  const [preReleaseLabel, preReleaseVersion] = preReleaseTag.split(".");

  return {
    major,
    minor,
    patch,
    preReleaseLabel,
    preReleaseVersion: preReleaseVersion ? parseInt(preReleaseVersion, 10) : 0,
  };
}
/**
 * @name 是否是预发版本
 * @param version 版本号
 * @returns boolaen
 */
function isPreRelease(version) {
  return /-/.test(version);
}
/**
 * @name 获取预发布版本号
 *
 */

function getPreReleaseVersion(currentVersion, type) {
  let { major, minor, patch, preReleaseLabel, preReleaseVersion } =
    currentVersion;
  switch (type) {
    case "prepatch":
      patch += 1;
      return `${major}.${minor}.${patch}-0`;
    case "preminor":
      minor += 1;
      return `${major}.${minor}.0-0`;
    case "premajor":
      major += 1;
      return `${major}.0.0-0`;
    case "prerelease":
      if (isPreRelease(`${major}.${minor}.${patch}`)) {
        preReleaseVersion = preReleaseVersion || 0;
        return `${major}.${minor}.${patch}-${preReleaseLabel || "beta"}.${
          preReleaseVersion + 1
        }`;
      } else {
        return `${major}.${minor}.${patch}-beta.0`;
      }
    default:
      throw new Error(`❌ 不支持的预发布版本类型: ${type}`);
  }
}

/**
 * @name 获取最新版本号
 */

async function getLatestVersion(packageName) {
  try {
    const { stdout } = await exec(`npm show ${packageName} version`);
    const latestVersion = stdout.trim().replace(/^v/, "");
    return {
      latestVersion,
      firstPublish: false,
    };
  } catch (error) {
    console.error(`❌ 获取最新版本失败: ${error.message}`);
    console.log(`⚠️ 包 ${packageName} 不存在，使用默认版本号 1.0.0`);
    return {
      latestVersion: "1.0.0",
      firstPublish: true,
    };
  }
}
/**
 * @name 更新版本号
 *
 */

function updateVersion(packageJsonPath, newVersion) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(`✅ 版本号已更新为 ${newVersion}`);
}
/**
 * @name 验证用户是否登录
 *
 */
async function ensureNpmLoggedIn() {
  try {
    const { stdout } = await exec("npm whoami");
    console.log(`✅ 检测到您已作为${stdout.trim()}登录到npm`);
    return stdout.trim();
  } catch (error) {
    console.error("❌ 您似乎还没有登录到npm。请登录后继续。");
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "username",
        message: "请输入您的npm用户名:",
      },
      {
        type: "password",
        name: "password",
        message: "请输入您的npm密码:",
      },
      {
        type: "input",
        name: "email",
        message: "请输入您的npm邮箱地址:",
      },
    ]);
    // 以下操作依赖于能够自动化的输入命令到npm login（在这个假设下编写）
    // 实际操作中这可能需要特殊处理，例如通过node-pty实现自动输入
    const { stdout: loginStdout } = await exec(
      `echo "${answers.username}\n${answers.password}\n${answers.email}\n" | npm login`
    );
    console.log("✅ 登录输出流loginStdout", loginStdout);
    return answers.username;
  }
}

/**
 * @name 异步发布到npm
 */

async function publishToNpm(packageDir) {
  console.log("🚀🚀🚀 正在发布到 npm...");
  try {
    const { stdout, stderr } = await exec("npm publish", { cwd: packageDir });
    if (stderr) {
      console.log(`✅ 发布输出流stderr: ${stderr}`);
      console.log(`🎉🎉🎉 npm包发布成功: ${stdout}`);
    }
  } catch (error) {
    console.error(`❌ 发布失败: ${error.message}`);
    throw error; // 抛出错误以供调用方处理
  }
}

/**
 * @name 打标记tag
 *
 */
function gitOperations(packageName, newVersion) {
  try {
    process.chdir(projectRootPath); // Change the current working directory to project root
    // 获取当前分支名
    const branchName = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();
    // tag 名
    const tagName = `${packageName}-v${newVersion}`;
    // 检查是否有设置upstream（远程跟踪分支）;
    let setUpstream = false;
    try {
      execSync(`git rev-parser --abbrev-ref --symbolic-full-name @{u}`);
    } catch (error) {
      const remoteBranchExists = execSync(
        `git ls-remote --head origin ${branchName}`
      )
        .toString()
        .trim();
      if (remoteBranchExists) {
        execSync(`git branch --set-upstream-to=origin/${branchName}`);
      } else {
        console.error(
          `❌ 远程分支 'origin/${branchName}' 不存在，无法设置 upstream。`
        );
        return;
      }
      setUpstream = true;
    }

    execSync(`git add .`, { stdio: "inherit" });
    execSync(`git commit -m "chore(release): ${tagName}"`, {
      stdio: "inherit",
    });

    // 检查并删除现有标签
    try {
      execSync(`git tag -d ${tagName}`, { stdio: "inherit" });
      execSync(`git push origin :refs/tags/${tagName}`, { stdio: "inherit" });
    } catch (tagError) {
      // 如果标签不存在，忽略错误
    }

    execSync(`git tag ${tagName}`, { stdio: "inherit" });

    // 推送改动到远程分支
    execSync(`git push`, { stdio: "inherit" });
    if (setUpstream) {
      // 如果之前没有 upstream，并且我们为其设置了 upstream，现在也推送它
      execSync(`git push --set-upstream origin ${branchName}`, {
        stdio: "inherit",
      });
    }
    // 推送tag到远程
    execSync(`git push origin ${tagName}`, { stdio: "inherit" });
    console.log(`✅ Git tag ${tagName} 已标记`);
  } catch (error) {
    console.error(`❌ Git 操作失败: ${error.message}`);
  }
}

/**
 * @name 设置npm的registry到指定的URL，并返回旧的registry
 */
async function setNpmRegistry() {
  try {
    const { stdout: getRegistryStdOut } = await exec(`npm config get registry`);
    const oldNpmRegistry = getRegistryStdOut.trim();
    await exec(`npm config set registry ${NPM_REGISTRY_URL}`);
    console.log(`✅ npm registry已设置为: ${NPM_REGISTRY_URL}`);
    return oldNpmRegistry;
  } catch (error) {
    if (error.stdout) {
      console.error(`❌ 设置npm registry stdout输出流: ${error.stdout}`);
    }
    if (error.stderr) {
      console.error(`❌ 设置npm registry stderr出错: ${error.stderr}`);
    }
    console.error(`❌ 设置npm registry中发生错误: ${error.message}`);
    throw error; // 抛出错误以供调用者处理
  }
}
/**
 * @name 恢复npm的registry为旧的URL
 */

async function restoreNpmRegistry(oldNpmRegistry) {
  if (oldNpmRegistry) {
    try {
      await exec(`npm config set registry ${oldNpmRegistry}`);
      console.log(`✅ npm registry已恢复为: ${oldNpmRegistry}`);
    } catch (error) {
      if (error.stderr) {
        console.error(`✅ 恢复npm registry输出流: ${error.stdout}`);
      }
      if (error.stderr) {
        console.error(`❌ 恢复npm registry出错: ${error.stderr}`);
      }
      console.error(`❌ 恢复npm registry中发生错误: ${error.message}`);
      throw error; // 抛出错误以供调用方处理
    }
  } else {
    console.error(`❌ 未找到旧的npm registry，无法恢复。`);
    throw new Error(`❌ 未找到旧的npm registry，无法恢复。`);
  }
}

/**
 * @name 命令行显示逻辑
 */ async function displayOptions(
  packageName,
  firstPublish,
  latestVersion,
  packageJsonPath
) {
  console.log(
    `✅ 发包脚本启动【自动更新版本号、自动发布到npm】 for package: ${packageName}`
  );
  console.log(
    "!!! 使用前请确保仓库内已经是可发布状态， firstPublish",
    firstPublish
  );
  if (firstPublish) {
    console.log("✅ ✅ ✅ 本次为首次发包");
    // 更新版本号
    updateVersion(packageJsonPath, latestVersion);
    // git增加tag并提交
    gitOperations(packageName, latestVersion);
    // 设置npm源
    const oldRegistryUrl = await setNpmRegistry();
    // 检测是否已经登录npm
    await ensureNpmLoggedIn();
    // 发布到npm
    await publishToNpm(path.dirname(packageJsonPath));
    // 恢复npm源
    await restoreNpmRegistry(oldRegistryUrl);
    return;
  }
  const currentVersion = parseVersion(latestVersion);
  const choices = [
    {
      name: `Major【大版本】 (${parseInt(currentVersion.major) + 1}.0.0)`,
      value: "major",
    },
    {
      name: `Minor【小版本】 (${currentVersion.major}.${
        parseInt(currentVersion.minor) + 1
      }.0)`,
      value: "minor",
    },
    {
      name: `Patch【修订版本】 (${currentVersion.major}.${
        currentVersion.minor
      }.${parseInt(currentVersion.patch) + 1})`,
      value: "patch",
    },
    // { name: `Prepatch【预发修订版本】`, value: 'prepatch' },
    // { name: `Preminor【预发小版本】`, value: 'preminor' },
    // { name: `Premajor【预发大版本】`, value: 'premajor' },
    // { name: `Prerelease【预发版】`, value: 'prerelease' },
    { name: `Specific version【指定版本】`, value: "specific" },
  ];
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "releaseType",
      message: "请选择版本号的更新类型:",
      choices: choices,
    },
    {
      type: "input",
      name: "specificVersion",
      message: "输入具体的版本号:",
      when: (answers) => answers.releaseType === "specific",
      validate: (input) =>
        /\d+\.\d+\.\d+(-\w+\.\d+)?/.test(input) ||
        "版本号必须符合语义化版本控制规范。",
    },
  ]);
  let newVersion = "";
  // 指定版本号
  if (answers.releaseType === "specific") {
    newVersion = answers.specificVersion;
  } else if (["major", "minor", "patch"].includes(answers.releaseType)) {
    // 非预发版本
    currentVersion[answers.releaseType]++;
    newVersion = `${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch}`;
  } else {
    // 预发布版本
    newVersion = getPreReleaseVersion(currentVersion, answers.releaseType);
  }
  // 更新版本号
  updateVersion(packageJsonPath, newVersion);
  // git增加tag并提交
  gitOperations(packageName, newVersion);
  // 设置npm源
  const oldRegistryUrl = await setNpmRegistry();
  // 检测是否已经登录npm
  await ensureNpmLoggedIn();
  // 发布到npm
  await publishToNpm(path.dirname(packageJsonPath));
  // 恢复npm源
  await restoreNpmRegistry(oldRegistryUrl);
}
// 主函数入口
async function monorepoPublishPkg() {
  try {
    // 获取子包package.json
    const packages = fs.readdirSync(projectsDir).filter((file) => {
      const packageJsonPath = path.join(projectsDir, file, "package.json");
      return fs.existsSync(packageJsonPath);
    });

    const choices = packages.map((pkg) => {
      const packageJsonPath = path.join(projectsDir, pkg, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      return { name: packageJson.name, value: pkg };
    });

    choices.unshift({ name: "All packages", value: "all" });

    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "package",
        message: "请选择要发布的包:",
        choices: choices,
      },
    ]);

    if (answers.package === "all") {
      for (const packageName of packages) {
        const packageJsonPath = path.join(
          projectsDir,
          packageName,
          "package.json"
        );
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        );
        const { latestVersion, firstPublish } = await getLatestVersion(
          packageJson.name
        );
        await displayOptions(
          packageJson.name,
          firstPublish,
          latestVersion,
          packageJsonPath
        );
      }

      // 调用 rush publish 命令
      console.log("🚀🚀🚀 正在使用 rush publish 发布所有包...");
      const { stdout, stderr } = await exec(
        "rush custom-publish --include-all"
      );
      if (stderr) {
        console.log(`✅ rush publish stderr: ${stderr}`);
      }
      console.log(`🎉🎉🎉 rush publish 成功: ${stdout}`);
    } else {
      const packageJsonPath = path.join(
        projectsDir,
        answers.package,
        "package.json"
      );
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const { latestVersion, firstPublish } = await getLatestVersion(
        packageJson.name
      );
      await displayOptions(
        packageJson.name,
        firstPublish,
        latestVersion,
        packageJsonPath
      );
    }
  } catch (error) {
    console.error("❌ 发生错误:", error);
  }
}

monorepoPublishPkg();
