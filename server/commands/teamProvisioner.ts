import teamCreator from "@server/commands/teamCreator";
import { sequelize } from "@server/database/sequelize";
import env from "@server/env";
import {
  DomainNotAllowedError,
  InvalidAuthenticationError,
  MaximumTeamsError,
} from "@server/errors";
import { APM } from "@server/logging/tracing";
import { Team, AuthenticationProvider } from "@server/models";

type TeamProvisionerResult = {
  team: Team;
  authenticationProvider: AuthenticationProvider;
  isNewTeam: boolean;
};

type Props = {
  /**
   * The internal ID of the team that is being logged into based on the
   * subdomain that the request came from, if any.
   */
  teamId?: string;
  /** The displayed name of the team */
  name: string;
  /** The domain name from the email of the user logging in */
  domain?: string;
  /** The preferred subdomain to provision for the team if not yet created */
  subdomain: string;
  /** The public url of an image representing the team */
  avatarUrl?: string | null;
  /** Details of the authentication provider being used */
  authenticationProvider: {
    /** The name of the authentication provider, eg "google" */
    name: string;
    /** External identifier of the authentication provider */
    providerId: string;
  };
  /** The IP address of the incoming request */
  ip: string;
};

async function teamProvisioner({
  teamId,
  name,
  domain,
  subdomain,
  avatarUrl,
  authenticationProvider,
  ip,
}: Props): Promise<TeamProvisionerResult> {
  let authP = await AuthenticationProvider.findOne({
    where: teamId
      ? { ...authenticationProvider, teamId }
      : authenticationProvider,
    include: [
      {
        model: Team,
        as: "team",
        required: true,
      },
    ],
  });

  // This authentication provider already exists which means we have a team and
  // there is nothing left to do but return the existing credentials
  if (authP) {
    return {
      authenticationProvider: authP,
      team: authP.team,
      isNewTeam: false,
    };
  } else if (teamId) {
    // The user is attempting to log into a team with an unfamiliar SSO provider
    throw InvalidAuthenticationError();
  }

  // This team has never been seen before, if self hosted the logic is different
  // to the multi-tenant version, we want to restrict to a single team that MAY
  // have multiple authentication providers
  if (env.DEPLOYMENT !== "hosted") {
    const team = await Team.findOne();

    // If the self-hosted installation has a single team and the domain for the
    // new team is allowed then assign the authentication provider to the
    // existing team
    if (team && domain) {
      if (await team.isDomainAllowed(domain)) {
        authP = await team.$create<AuthenticationProvider>(
          "authenticationProvider",
          authenticationProvider
        );
        return {
          authenticationProvider: authP,
          team,
          isNewTeam: false,
        };
      } else {
        throw DomainNotAllowedError();
      }
    }

    if (team) {
      throw MaximumTeamsError();
    }
  }

  // We cannot find an existing team, so we create a new one
  const team = await sequelize.transaction((transaction) => {
    return teamCreator({
      name,
      domain,
      subdomain,
      avatarUrl,
      authenticationProviders: [authenticationProvider],
      ip,
      transaction,
    });
  });

  return {
    team,
    authenticationProvider: team.authenticationProviders[0],
    isNewTeam: true,
  };
}

export default APM.traceFunction({
  serviceName: "command",
  spanName: "teamProvisioner",
})(teamProvisioner);
