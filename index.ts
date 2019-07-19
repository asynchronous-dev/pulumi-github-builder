import * as pulumi from '@pulumi/pulumi';
import { API, Request, Response } from '@pulumi/cloud';
import * as awsx from '@pulumi/awsx';
import * as crypto from 'crypto';

const config = new pulumi.Config();

const githubConfig = {
  webhookSecret:
    process.env.GITHUB_WEBHOOK_SECRET_TOKEN ||
    config.get('githubWebhookSecret'),
};

// Just logs information aincomming webhook request.
async function logRequest(req: Request, _: Response, next: () => void) {
  const webhookID = req.headers['x-github-delivery'];
  const webhookKind = req.headers['x-github-event'];
  console.log(
    `Received webhook from GitHub ${webhookID} [${webhookKind}] => ${JSON.stringify(
      req,
      null,
      2
    )}`
  );
  next();
}

// Webhooks can optionally be configured with a shared secret, so that webhook handlers like this app can authenticate
// message integrity. Rejects any incomming requests that don't have a valid "pulumi-webhook-signature" header.
async function authenticateRequest(
  req: Request,
  res: Response,
  next: () => void
) {
  const webhookSig = req.headers['x-hub-signature'] as string; // headers[] returns (string | string[]).
  if (!githubConfig.webhookSecret || !webhookSig) {
    console.log('skipping authentication');
    next();
    return;
  }

  const payload = req.body.toString();
  const hmacAlg = crypto.createHmac('sha1', githubConfig.webhookSecret);
  const computedSignature = `sha1=${hmacAlg.update(payload).digest('hex')}`;

  const result = crypto.timingSafeEqual(
    Buffer.from(webhookSig),
    Buffer.from(computedSignature)
  );

  if (!result) {
    console.log(
      `Mismatch between expected signature and HMAC: '${webhookSig}' vs. '${computedSignature}'.`
    );
    res
      .status(400)
      .end(
        'Unable to authenticate message: Mismatch between signature and HMAC'
      );
    return;
  }
  next();
}

// const vpc = new awsx.ec2.Vpc('builds', {
//   cidrBlock: '10.0.0.0/16',
// });
// const vpc = awsx.ec2.Vpc.getDefault();

const cluster = new awsx.ecs.Cluster('cluster'); //, {
//   vpc,
// });

// cluster.createAutoScalingGroup('repo-er', {
//   subnetIds: vpc.publicSubnetIds,
//   launchConfigurationArgs: {
//     userData: `
// yum install -y gcc libstdc+-devel gcc-c+ fuse fuse-devel curl-devel libxml2-devel mailcap automake openssl-devel git gcc-c++
// git clone https://github.com/s3fs-fuse/s3fs-fuse
// cd s3fs-fuse/
// ./autogen.sh
// ./configure --prefix=/usr --with-openssl
// make
// make install
// docker plugin install rexray/s3fs:latest S3FS_REGION=us-west-2 S3FS_OPTIONS="allow_other,iam_role=auto,umask=000" LIBSTORAGE_INTEGRATION_VOLUME_OPERATIONS_MOUNT_ROOTPATH=/ --grant-all-permissions
// `,
//   },
// });

const task = new awsx.ecs.FargateTaskDefinition('curlbin', {
  containers: {
    post: {
      image: 'byrnedo/alpine-curl',
      command: ['-X', 'POST', 'http://requestbin.fullcontact.com/xzyjd6xz'],
    },
    build: {
      image: 'andycunn/gitbuild',
      environment: [
        {
          name: 'APP_ID',
          value: process.env.APP_ID as string,
        },
      ],
    },
  },
});

const webhookHandler = new API('github-hook-catcher');

webhookHandler.post('/', logRequest, authenticateRequest, async (req, res) => {
  const webhookKind = req.headers['x-github-event'] as string; // headers[] returns (string | string[]).
  const payload = req.body.toString();
  const parsedPayload = JSON.parse(payload);
  const prettyPrintedPayload = JSON.stringify(parsedPayload, null, 2);

  console.log('task', task);
  console.log('event', prettyPrintedPayload);

  try {
    const response = await task.run({
      cluster,
      startedBy: 'github',
      overrides: {
        containerOverrides: [
          {
            name: 'post',
            command: [
              '-X',
              'POST',
              '-d',
              payload,
              'http://requestbin.fullcontact.com/xzyjd6xz',
            ],
          },
          {
            name: 'build',
            environment: [
              {
                name: 'INSTALLATION_ID',
                value: parsedPayload.installation.id,
              },
              {
                name: 'BRANCH',
                value: parsedPayload.installation.id,
              },
            ],
          },
        ],
      },
    });

    console.log('executed task', response);
  } catch (e) {
    console.log('failed to run task', e);
  }

  res.status(200).end('foo');
});

export const url = webhookHandler.publish().url;
