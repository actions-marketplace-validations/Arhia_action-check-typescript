import { info, startGroup, endGroup, setFailed } from '@actions/core'
import * as path from 'path'
// import { context, getOctokit } from '@actions/github'
// import { createCheck } from './createCheck'
import * as github from '@actions/github'
import { GitHub } from '@actions/github/lib/utils'
import { compile } from './compile'
import * as fs from 'fs'
import { parseTsConfigFileToCompilerOptions } from './parseTsConfigFileToCompilerOptions'
import { getAndValidateArgs } from './getAndValidateArgs'
import { parseTsConfigFile } from './parseTsConfigFile'
import { getFilesToCompile } from './getFilesToCompile'
import { exec } from '@actions/exec'
import { filterErrors } from './filterErrors'
import { formatOneError } from './formatOneError'
import { runTsc } from './runTsc'

interface PullRequest {
  number: number;
  html_url?: string
  body?: string
  changed_files: number
}

type GithubClient = InstanceType<typeof GitHub>

async function run(): Promise<void> {
  try {
    const args = getAndValidateArgs()
    const workingDir = path.join(process.cwd(), args.directory)
    info(`working directory: ${workingDir}`)

    const tsconfigPath = path.join(workingDir, args.configPath)
    info(`tsconfigPath: ${tsconfigPath}`)
    if (!fs.existsSync(tsconfigPath)) {
      throw new Error(`could not find tsconfig.json at: ${tsconfigPath}`)
    }

    const pr = github.context.payload.pull_request

    if (!pr) {
      throw Error('Could not retrieve PR information. Only "pull_request" triggered workflows are currently supported.')
    }

    const execOptions = {
      ...(args.directory ? { cwd: args.directory } : {})
    }

    const yarnLock = fs.existsSync(path.resolve(workingDir, 'yarn.lock'))
    const packageLock = fs.existsSync(path.resolve(workingDir, 'package-lock.json'))

    let installScript = `npm install`
    if (yarnLock) {
      installScript = `yarn --frozen-lockfile`
    } else if (packageLock) {
      installScript = `npm ci`
    }

    startGroup(`[current branch] Install Dependencies`)
    info(`Installing using ${installScript}`)
    await exec(installScript, [], execOptions)
    endGroup()

    const compilerOptions = {
      ...parseTsConfigFileToCompilerOptions(tsconfigPath),
      noEmit: true
    }

    info(`[current branch] compilerOptions ${JSON.stringify(compilerOptions)}`)

    const config = parseTsConfigFile(tsconfigPath)
    info(`[current branch] config ${JSON.stringify(config)}`)

    const fileNames = getFilesToCompile({
      workingDir,
      rootDir: config.compilerOptions.rootDir,
      include: config.include,
      exclude: config.exclude
    })

    info(`[current branch] files to compile : \n${fileNames.map(one => `${one}\n`)}`)

    startGroup(`[current branch] compile ts files`)
    //const resultTsc = compile(fileNames, compilerOptions)

    const { output: tscOutput, error: execError } = await runTsc({
      workingDir,
      tsconfigPath
    })

    info(`output exec compiler: ${tscOutput}`)
    info(`error exec compiler: ${execError}`)

    /*
    const errorsRelatedToSourceCode = filterErrors(resultTsc.fileErrors, fileNames)
    info(`[current branch] number of typescript errors for all project files: ${errorsRelatedToSourceCode.length}`)

    startGroup(`[current branch] project errors \n${errorsRelatedToSourceCode.map(formatOneError)}`)
    endGroup()

    const filesChanged = pr.repository.pullRequest.files.nodes
    info(`filesChanged : ${JSON.stringify(filesChanged)}`)
    const errorsRelatedToChangedFiles = filterErrors(resultTsc.fileErrors, filesChanged)
    info(`[current branch] number of typescript errors for changed files: ${errorsRelatedToChangedFiles.length}`)
    endGroup()
    */

  } catch (errorRun) {
    setFailed(errorRun.message)
  }
}

run()
