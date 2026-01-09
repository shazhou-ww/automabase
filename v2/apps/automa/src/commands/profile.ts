/**
 * Profile commands
 */

import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { pollForToken, requestDeviceAuthorization } from '../auth/oauth-device';
import { getDefaultProfile, setDefaultProfile } from '../config/config-manager';
import {
  addProfile,
  getProfile,
  getProfileStatus,
  listProfiles,
  removeProfile,
  updateProfileCredentials,
} from '../config/profile-manager';
import { DEFAULT_SCOPES, type OAuthConfig } from '../config/types';
import { error, info, printTable, success } from '../utils/output';

export function createProfileCommand(): Command {
  const profile = new Command('profile').description('Manage authentication profiles');

  // profile add
  profile
    .command('add <name>')
    .description('Add a new profile')
    .option('--issuer <url>', 'OAuth issuer URL')
    .option('--client-id <id>', 'OAuth client ID')
    .option('--device-auth-endpoint <url>', 'Device authorization endpoint')
    .option('--token-endpoint <url>', 'Token endpoint')
    .option('--scopes <scopes>', 'OAuth scopes (comma-separated)')
    .action(async (name: string, options) => {
      // Check if profile already exists
      if (getProfile(name)) {
        error(`Profile "${name}" already exists`);
        process.exit(1);
      }

      try {
        let issuer = options.issuer;
        let clientId = options.clientId;
        let deviceAuthEndpoint = options.deviceAuthEndpoint;
        let tokenEndpoint = options.tokenEndpoint;
        const scopes = options.scopes?.split(',') || DEFAULT_SCOPES;

        // Interactive mode if options not provided
        if (!issuer) {
          issuer = await input({
            message: 'OAuth Issuer URL:',
            validate: (v) => (v ? true : 'Issuer URL is required'),
          });
        }

        if (!clientId) {
          clientId = await input({
            message: 'OAuth Client ID:',
            default: 'automa-cli',
          });
        }

        if (!deviceAuthEndpoint) {
          deviceAuthEndpoint = await input({
            message: 'Device Authorization Endpoint:',
            default: `${issuer}/oauth/device/code`,
          });
        }

        if (!tokenEndpoint) {
          tokenEndpoint = await input({
            message: 'Token Endpoint:',
            default: `${issuer}/oauth/token`,
          });
        }

        const oauth: OAuthConfig = {
          issuer,
          clientId,
          deviceAuthEndpoint,
          tokenEndpoint,
          scopes,
        };

        addProfile(name, oauth);
        success(`Profile "${name}" created`);
        info(`Run: automa profile login ${name}`);
      } catch (err) {
        if (err instanceof Error && err.message.includes('User force closed')) {
          info('Profile creation cancelled');
          return;
        }
        throw err;
      }
    });

  // profile list
  profile
    .command('list')
    .description('List all profiles')
    .action(() => {
      const profiles = listProfiles();
      const defaultProfile = getDefaultProfile();

      if (profiles.length === 0) {
        info('No profiles configured');
        info('Run: automa profile add <name>');
        return;
      }

      const headers = ['', 'NAME', 'ISSUER', 'STATUS'];
      const rows = profiles.map((name) => {
        const p = getProfile(name);
        const isDefault = name === defaultProfile;
        const status = getProfileStatus(name);

        const statusColor =
          status === 'logged in'
            ? chalk.green(status)
            : status === 'token expired'
              ? chalk.yellow(status)
              : chalk.gray(status);

        return [isDefault ? chalk.green('*') : ' ', name, p?.oauth.issuer || '', statusColor];
      });

      printTable(headers, rows, { compact: true });
    });

  // profile show
  profile
    .command('show [name]')
    .description('Show profile details')
    .action((name?: string) => {
      const profileName = name || getDefaultProfile();

      if (!profileName) {
        error('No profile specified and no default profile set');
        process.exit(1);
      }

      const p = getProfile(profileName);
      if (!p) {
        error(`Profile "${profileName}" not found`);
        process.exit(1);
      }

      const status = getProfileStatus(profileName);
      const isDefault = profileName === getDefaultProfile();

      console.log(chalk.bold(`Profile: ${profileName}${isDefault ? ' (default)' : ''}`));
      console.log();
      console.log('OAuth Configuration:');
      console.log(`  Issuer:      ${p.oauth.issuer}`);
      console.log(`  Client ID:   ${p.oauth.clientId}`);
      console.log(`  Scopes:      ${p.oauth.scopes.join(', ')}`);
      console.log();
      console.log(`Status: ${status}`);

      if (p.credentials) {
        console.log(`Token Expires: ${p.credentials.expiresAt}`);
      }
    });

  // profile use
  profile
    .command('use <name>')
    .description('Set default profile')
    .action((name: string) => {
      const p = getProfile(name);
      if (!p) {
        error(`Profile "${name}" not found`);
        process.exit(1);
      }

      setDefaultProfile(name);
      success(`Default profile set to "${name}"`);
    });

  // profile remove
  profile
    .command('remove <name>')
    .description('Remove a profile')
    .action((name: string) => {
      if (!removeProfile(name)) {
        error(`Profile "${name}" not found`);
        process.exit(1);
      }

      success(`Profile "${name}" removed`);
    });

  // profile login
  profile
    .command('login [name]')
    .description('Login to a profile using Device Code Flow')
    .action(async (name?: string) => {
      const profileName = name || getDefaultProfile();

      if (!profileName) {
        error('No profile specified and no default profile set');
        info('Run: automa profile add <name>');
        process.exit(1);
      }

      const p = getProfile(profileName);
      if (!p) {
        error(`Profile "${profileName}" not found`);
        process.exit(1);
      }

      try {
        info('Requesting device authorization...');

        const deviceAuth = await requestDeviceAuthorization(p.oauth);

        console.log();
        console.log(chalk.bold('Please visit:'), chalk.cyan(deviceAuth.verificationUri));
        console.log(chalk.bold('Enter code:  '), chalk.yellow.bold(deviceAuth.userCode));
        console.log();

        if (deviceAuth.verificationUriComplete) {
          console.log(chalk.gray(`Or open: ${deviceAuth.verificationUriComplete}`));
          console.log();
        }

        process.stdout.write('Waiting for authorization...');

        const credentials = await pollForToken(
          p.oauth,
          deviceAuth.deviceCode,
          deviceAuth.interval,
          deviceAuth.expiresIn,
          () => {
            process.stdout.write('.');
          }
        );

        console.log();
        updateProfileCredentials(profileName, credentials);
        success(`Successfully logged in to profile "${profileName}"`);
      } catch (err) {
        console.log();
        error(err instanceof Error ? err.message : 'Login failed');
        process.exit(1);
      }
    });

  // profile logout
  profile
    .command('logout [name]')
    .description('Logout from a profile (clear tokens)')
    .action((name?: string) => {
      const profileName = name || getDefaultProfile();

      if (!profileName) {
        error('No profile specified and no default profile set');
        process.exit(1);
      }

      const p = getProfile(profileName);
      if (!p) {
        error(`Profile "${profileName}" not found`);
        process.exit(1);
      }

      updateProfileCredentials(profileName, null);
      success(`Logged out from profile "${profileName}"`);
    });

  return profile;
}
