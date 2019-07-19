import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import createGithubApp from './github-app';
import { readFileSync, createWriteStream } from 'fs';
import { ReposGetArchiveLinkResponse, Response } from '@octokit/rest';
import { get } from 'https';

const init = () => {
  console.log(
    chalk.green(
      figlet.textSync('HELLO', {
        font: 'Ghost',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
};

interface LinkResponse extends Response<ReposGetArchiveLinkResponse> {
  url?: string;
}

const run = async () => {
  // show script introduction
  init();

  console.log('starting', process.env.APP_ID, process.env.BRANCH);

  const githubApp = createGithubApp({
    id: process.env.APP_ID,
    cert: readFileSync(process.env.PRIVATE_KEY_PATH),
    debug: true,
  });

  console.log('created app', JSON.stringify(githubApp));

  const github = await githubApp.asInstallation(process.env.INSTALLATION_ID);
  const response = (await github.repos.getArchiveLink({
    owner: 'andycmaj',
    repo: 'advent_2018',
    archive_format: 'zipball',
    ref: process.env.BRANCH,
  })) as LinkResponse;

  if (response.status === 200) {
    const fileName = /filename=(.+)/.exec(
      response.headers['content-disposition']
    )[0];

    console.log(response.url);

    const file = createWriteStream('file.zip');
    const request = get(response.url, function(response) {
      response.pipe(file);
    });
  }
  // HERE YA GO
};

run();
