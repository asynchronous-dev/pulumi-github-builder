import jwt from 'jsonwebtoken';
import GitHubApi from '@octokit/rest';

export default function(
  args: {
    id: string;
    cert: Buffer;
    debug?: Boolean;
  } = { debug: false }
) {
  const { id, cert, debug } = args;

  function asApp(): Promise<GitHubApi> {
    const github = new GitHubApi({ debug });
    github.authenticate({ type: 'app', token: generateJwt(id, cert) });
    // Return a promise to keep API consistent
    return Promise.resolve(github);
  }

  // Authenticate as the given installation
  function asInstallation(installationId): Promise<GitHubApi> {
    return createToken(installationId).then(res => {
      const github = new GitHubApi({ debug });
      github.authenticate({ type: 'token', token: res.data.token });
      return github;
    });
  }

  // https://developer.github.com/early-access/integrations/authentication/#as-an-installation
  function createToken(installationId) {
    return asApp().then(github => {
      return github.apps.createInstallationToken({
        installation_id: installationId,
      });
    });
  }

  // Internal - no need to exose this right now
  function generateJwt(id, cert) {
    const payload = {
      iat: Math.floor(new Date().getTime() / 1000), // Issued at time
      exp: Math.floor(new Date().getTime() / 1000) + 60, // JWT expiration time
      iss: id, // Integration's GitHub id
    };

    // Sign with RSA SHA256
    return jwt.sign(payload, cert, { algorithm: 'RS256' });
  }

  return { asApp, asInstallation, createToken };
}
